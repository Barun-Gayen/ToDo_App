(() => {
    "use strict";

    const STORE_KEY = "tape-todo-v1";
    const RANK = { high: 0, med: 1, low: 2 };
    const LABEL = { high: "High", med: "Medium", low: "Low" };
    const EMPTY = {
        all: "Nothing on the list. Type a task above to add one.",
        active: "No open tasks. Everything is done.",
        done: "No finished tasks yet. Tick one off and it shows up here."
    };

    // ---------- Elements ----------
    const $ = (selector, root = document) => root.querySelector(selector);
    const form = $("#add-form");
    const input = $("#task-input");
    const errorEl = $("#form-error");
    const list = $("#task-list");
    const filtersEl = $("#filters");
    const themeBtn = $("#theme-toggle");
    const sortBtn = $("#sort-btn");
    const clearBtn = $("#clear-btn");
    const fillEl = $("#fill");
    const rulerEl = $("#ruler");
    const progressLabel = $("#progress-label");
    const leftText = $("#left-text");
    const toastEl = $("#toast");
    const toastMsg = $("#toast-msg");
    const toastUndo = $("#toast-undo");

    // ---------- State ----------
    let state = load();
    let lastAddedId = null;
    let snapshot = null;
    let toastTimer = null;

    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function isValid(task) {
        return task && typeof task.text === "string" && task.priority in RANK;
    }

    function load() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORE_KEY));
            if (saved && Array.isArray(saved.tasks)) {
                return {
                    tasks: saved.tasks.filter(isValid).map(t => ({ ...t, id: t.id || uid(), done: !!t.done })),
                    filter: ["all", "active", "done"].includes(saved.filter) ? saved.filter : "all",
                    theme: saved.theme === "dark" || saved.theme === "light" ? saved.theme : null
                };
            }
        } catch (err) { /* storage blocked or data corrupted: start fresh */ }

        return {
            tasks: [
                { id: uid(), text: "Push the project to GitHub", done: false, priority: "high" },
                { id: uid(), text: "Update the resume", done: false, priority: "med" },
                { id: uid(), text: "Drink some water", done: true, priority: "low" }
            ],
            filter: "all",
            theme: null
        };
    }

    function save() {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(state));
        } catch (err) { /* private mode or quota: the app still works for this session */ }
    }

    const findTask = id => state.tasks.find(t => t.id === id);
    const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ---------- Rendering ----------
    function make(tag, className) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        return node;
    }

    function buildItem(task) {
        const li = make("li", "task p-" + task.priority);
        if (task.done) li.classList.add("is-done");
        if (task.id === lastAddedId) li.classList.add("enter");
        li.dataset.id = task.id;
        li.draggable = state.filter === "all";

        const grip = make("span", "grip");
        grip.setAttribute("aria-hidden", "true");

        const check = make("button", "check");
        check.type = "button";
        check.dataset.action = "toggle";
        check.setAttribute("role", "checkbox");
        check.setAttribute("aria-checked", String(task.done));
        check.setAttribute("aria-label", `${task.text}, ${LABEL[task.priority]} priority`);

        const text = make("span", "text");
        text.textContent = task.text;

        const tag = make("span", "tag");
        tag.textContent = LABEL[task.priority];

        const edit = make("button", "btn-mini");
        edit.type = "button";
        edit.dataset.action = "edit";
        edit.textContent = "Edit";
        edit.setAttribute("aria-label", "Edit " + task.text);

        const del = make("button", "btn-mini");
        del.type = "button";
        del.dataset.action = "delete";
        del.textContent = "Delete";
        del.setAttribute("aria-label", "Delete " + task.text);

        li.append(grip, check, text, tag, edit, del);
        return li;
    }

    function visibleTasks() {
        if (state.filter === "active") return state.tasks.filter(t => !t.done);
        if (state.filter === "done") return state.tasks.filter(t => t.done);
        return state.tasks;
    }

    function render() {
        list.textContent = "";
        list.classList.toggle("sortable", state.filter === "all");

        const items = visibleTasks();
        if (items.length === 0) {
            const empty = make("li", "empty");
            empty.textContent = EMPTY[state.filter];
            list.appendChild(empty);
        }
        items.forEach(task => list.appendChild(buildItem(task)));

        lastAddedId = null;
        updateMeta();
    }

    function updateMeta() {
        const total = state.tasks.length;
        const done = state.tasks.filter(t => t.done).length;
        const open = total - done;
        const percent = total ? Math.round((done / total) * 100) : 0;

        $("#count-all").textContent = total;
        $("#count-active").textContent = open;
        $("#count-done").textContent = done;

        filtersEl.querySelectorAll("button").forEach(btn => {
            btn.setAttribute("aria-pressed", String(btn.dataset.filter === state.filter));
        });

        fillEl.style.width = percent + "%";
        rulerEl.setAttribute("aria-valuenow", String(percent));
        progressLabel.textContent = total ? `${done} of ${total} done` : "No tasks yet";

        if (total === 0) leftText.textContent = "";
        else if (open === 0) leftText.textContent = "All done. Nice work.";
        else leftText.textContent = `${open} ${open === 1 ? "task" : "tasks"} left`;

        clearBtn.disabled = done === 0;
        sortBtn.disabled = total < 2;
    }

    // ---------- Add ----------
    function showError(message) {
        errorEl.textContent = message;
        input.setAttribute("aria-invalid", "true");
        input.classList.remove("shake");
        void input.offsetWidth; // restart the shake animation
        input.classList.add("shake");
    }

    function clearError() {
        errorEl.textContent = "";
        input.removeAttribute("aria-invalid");
    }

    form.addEventListener("submit", event => {
        event.preventDefault();
        const text = input.value.trim();
        if (!text) {
            showError("Type a task before adding it.");
            input.focus();
            return;
        }

        const task = { id: uid(), text, done: false, priority: form.elements.priority.value };
        state.tasks.push(task);
        state.filter = "all";
        lastAddedId = task.id;
        save();
        render();

        input.value = "";
        clearError();
        input.focus();
    });

    input.addEventListener("input", clearError);

    // ---------- Toggle, edit, delete (event delegation on the list) ----------
    list.addEventListener("click", event => {
        const btn = event.target.closest("button[data-action]");
        if (!btn) return;
        const li = btn.closest("li.task");
        const id = li.dataset.id;

        if (btn.dataset.action === "toggle") toggleTask(id);
        else if (btn.dataset.action === "edit") startEdit(li, id);
        else if (btn.dataset.action === "delete") deleteTask(li, id);
    });

    list.addEventListener("dblclick", event => {
        const text = event.target.closest(".text");
        if (!text) return;
        const li = text.closest("li.task");
        startEdit(li, li.dataset.id);
    });

    function toggleTask(id) {
        const task = findTask(id);
        if (!task) return;
        task.done = !task.done;
        save();
        render();
        const again = list.querySelector(`li[data-id="${id}"] .check`);
        if (again) again.focus();
    }

    function startEdit(li, id) {
        if (li.classList.contains("editing")) return;
        const task = findTask(id);
        const textEl = $(".text", li);
        if (!task || !textEl) return;

        const field = make("input", "edit-field");
        field.type = "text";
        field.value = task.text;
        field.maxLength = 120;
        field.setAttribute("aria-label", "Edit task");

        li.classList.add("editing");
        li.draggable = false;
        textEl.replaceWith(field);
        field.focus();
        field.select();

        let finished = false;
        const finish = commit => {
            if (finished) return;
            finished = true;
            const value = field.value.trim();
            if (commit && value) {
                task.text = value;
                save();
            }
            render();
        };

        field.addEventListener("keydown", event => {
            if (event.key === "Enter") { event.preventDefault(); finish(true); }
            else if (event.key === "Escape") finish(false);
        });
        field.addEventListener("blur", () => finish(true));
    }

    function deleteTask(li, id) {
        if (li.classList.contains("leaving")) return;
        takeSnapshot();
        li.classList.add("leaving");
        li.draggable = false;

        setTimeout(() => {
            state.tasks = state.tasks.filter(t => t.id !== id);
            save();
            li.remove();
            if (!list.querySelector(".task")) render();
            else updateMeta();
            showToast("Task deleted.");
        }, reducedMotion() ? 0 : 200);
    }

    // ---------- Filters, sort, clear ----------
    filtersEl.addEventListener("click", event => {
        const btn = event.target.closest("button[data-filter]");
        if (!btn) return;
        state.filter = btn.dataset.filter;
        save();
        render();
    });

    sortBtn.addEventListener("click", () => {
        takeSnapshot();
        state.tasks.sort((a, b) => RANK[a.priority] - RANK[b.priority]);
        save();
        render();
        showToast("Sorted by priority.");
    });

    clearBtn.addEventListener("click", () => {
        const count = state.tasks.filter(t => t.done).length;
        if (!count) return;
        takeSnapshot();
        state.tasks = state.tasks.filter(t => !t.done);
        save();
        render();
        showToast(count === 1 ? "1 done task cleared." : `${count} done tasks cleared.`);
    });

    // ---------- Undo ----------
    function takeSnapshot() {
        snapshot = JSON.stringify(state.tasks);
    }

    function showToast(message) {
        toastMsg.textContent = message;
        toastEl.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(hideToast, 6000);
    }

    function hideToast() {
        toastEl.classList.remove("show");
    }

    toastUndo.addEventListener("click", () => {
        if (!snapshot) return;
        state.tasks = JSON.parse(snapshot);
        snapshot = null;
        save();
        render();
        hideToast();
    });

    // ---------- Drag and drop reorder ----------
    let dragEl = null;

    function elementAfter(y) {
        let closest = { offset: -Infinity, el: null };
        list.querySelectorAll("li.task:not(.dragging)").forEach(el => {
            const box = el.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) closest = { offset, el };
        });
        return closest.el;
    }

    list.addEventListener("dragstart", event => {
        const li = event.target.closest && event.target.closest("li.task");
        if (!li || state.filter !== "all" || li.classList.contains("editing")) {
            event.preventDefault();
            return;
        }
        dragEl = li;
        li.classList.add("dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", li.dataset.id);
    });

    list.addEventListener("dragover", event => {
        if (!dragEl) return;
        event.preventDefault();
        const after = elementAfter(event.clientY);
        if (after) list.insertBefore(dragEl, after);
        else list.appendChild(dragEl);
    });

    list.addEventListener("dragend", () => {
        if (!dragEl) return;
        dragEl.classList.remove("dragging");
        dragEl = null;

        const byId = new Map(state.tasks.map(t => [t.id, t]));
        const order = [...list.querySelectorAll("li.task")].map(li => byId.get(li.dataset.id));
        state.tasks = order.filter(Boolean);
        save();
    });

    // keyboard reorder: Alt + Up / Alt + Down on a focused task
    list.addEventListener("keydown", event => {
        if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
        if (state.filter !== "all" || event.target.matches("input")) return;
        const li = event.target.closest("li.task");
        if (!li) return;

        event.preventDefault();
        const from = state.tasks.findIndex(t => t.id === li.dataset.id);
        const to = from + (event.key === "ArrowUp" ? -1 : 1);
        if (to < 0 || to >= state.tasks.length) return;

        [state.tasks[from], state.tasks[to]] = [state.tasks[to], state.tasks[from]];
        save();
        render();
        const again = list.querySelector(`li[data-id="${li.dataset.id}"] .check`);
        if (again) again.focus();
    });

    // ---------- Theme ----------
    function applyTheme() {
        const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const theme = state.theme || (systemDark ? "dark" : "light");
        document.documentElement.dataset.theme = theme;
        themeBtn.textContent = theme === "dark" ? "Light mode" : "Dark mode";
    }

    themeBtn.addEventListener("click", () => {
        const current = document.documentElement.dataset.theme;
        state.theme = current === "dark" ? "light" : "dark";
        save();
        applyTheme();
    });

    // ---------- Start ----------
    $("#today").textContent = new Intl.DateTimeFormat(undefined, {
        weekday: "long", day: "numeric", month: "long"
    }).format(new Date());

    applyTheme();
    render();
})();
