class TaskManager {
    constructor() {
        this.taskIdCounter = 1;
        this.scenarioIdCounter = 2;
        this.projectIdCounter = 2;
        this.tagIdCounter = 1;
        this.alertIdCounter = 1;
        this.currentScenario = 1;
        this.currentProject = 1;
        this.editingTags = [];
        this.editingItemId = null;
        this.currentFilter = 'all';
        this.activeSortingFilters = new Set();
        this.activeTagFilters = new Set();
        this.isProcessingSubtask = false;
        this.allTasksCollapsed = false;
        this.selectedTasks = new Set();
        this.lastSelectedTaskId = null;
        this.isMultiSelectMode = false;
        this.currentlyEditingTaskId = null;
        
        this.data = this.initializeDefaultData();
        
        // Variables del asistente IA
        this.assistantVisible = false;
        this.currentModule = 'tasks';
        this.selectedScenarios = new Set();
        this.selectedProjects = new Set();
        this.mensajes = [];
        
        // Configuración de IA
        this.aiConfig = {
            apiKey: '',
            model: 'gpt-5-mini',
            maxTokens: 1000,
            temperature: 1,
            historyLimit: 10
        };
        
        this.aiStats = {
            todayQueries: 0,
            totalTokens: 0,
            estimatedCost: 0,
            usageHistory: [],
            currentModel: 'GPT-5 Mini',
            lastResetDate: new Date().toDateString()
        };
        
        this.modelPricing = {
            'gpt-5-nano': { input: 0.00005, output: 0.0004 },
            'gpt-5-mini': { input: 0.00025, output: 0.002 },
            'gpt-5': { input: 0.00125, output: 0.01 }
        };
        
        // Configuración de prompts por contexto
        this.promptContexts = {
            general: {
                id: 'general',
                name: 'General',
                icon: '🤖',
                description: 'Asistente general para cualquier consulta',
                systemPrompt: 'Eres un asistente útil y amigable. Ayuda al usuario con cualquier consulta de manera clara y concisa.'
            },
            tasks: {
                id: 'tasks',
                name: 'Tareas',
                icon: '📋',
                description: 'Especializado en gestión de tareas y productividad',
                systemPrompt: 'Eres un asistente especializado en gestión de tareas y productividad. Ayuda al usuario a organizar, planificar y completar sus tareas de manera eficiente.'
            }
        };
        
        // Inicializar sistema de alertas
        this.alertTimeouts = {};
        this.countdownIntervals = {};
        
        this.init();
        this.registerServiceWorker();
        
        // Inicializar actualización de badges de tiempo en tiempo real
        this.startTimeBadgeUpdater();
    }

    initializeDefaultData() {
        return {
            1: {
                id: 1,
                name: 'Por defecto',
                icon: '🏠',
                description: 'Escenario principal',
                projects: {
                    1: { id: 1, name: 'Sin proyecto', icon: '📋', description: 'Tareas sin categorizar', tasks: [] }
                }
            }
        };
    }

    init() {
        this.loadData();
        this.bindEvents();
        this.updateSelectors();
        this.render();
        this.updateFilterTags();
        this.initAssistant();
    }

    // === EVENTOS UNIFICADOS ===
    bindEvents() {
        // Delegación de eventos unificada
        document.addEventListener('click', this.handleClick.bind(this));
        document.addEventListener('change', this.handleChange.bind(this));
        document.addEventListener('submit', this.handleSubmit.bind(this));
        document.addEventListener('keydown', this.handleKeydown.bind(this));
        document.addEventListener('selectionchange', this.handleSelectionChange.bind(this));
        document.addEventListener('input', this.handleInput.bind(this));
        document.addEventListener('blur', this.handleBlur.bind(this), true);
    }

    handleClick(e) {
        // Manejar eventos del asistente
        if (e.target.id === 'toggleAssistant') {
            this.toggleAssistant();
            return;
        }
        
        if (e.target.classList.contains('module-option')) {
            const module = e.target.dataset.module;
            this.selectModule(module);
            return;
        }
        
        // Los clics del asistente ahora se manejan con onclick en el HTML generado dinámicamente
        
        if (e.target.id === 'sendButton') {
            this.sendMessage();
            return;
        }
        
        // Manejar botones de markdown
        if (e.target.classList.contains('markdown-btn')) {
            e.preventDefault();
            e.stopPropagation();
            const format = e.target.getAttribute('data-format');
            const editor = e.target.closest('.markdown-editor').querySelector('.markdown-editor-content');
            if (editor && format) {
                this.applyHtmlFormat(editor, format);
            }
            return;
        }
        
        // Manejar clics en enlaces dentro del editor
        if (e.target.tagName === 'A' && e.target.closest('.markdown-editor-content')) {
            e.stopPropagation();
            // Asegurar que la URL tenga protocolo
            let url = e.target.href;
            if (!url.match(/^https?:\/\//i)) {
                url = 'https://' + e.target.textContent;
            }
            // Abrir enlace manualmente para asegurar que funcione
            window.open(url, '_blank', 'noopener,noreferrer');
            return;
        }
        
        // Actualizar estado de botones cuando se hace clic en el editor
        if (e.target.classList.contains('markdown-editor-content')) {
            setTimeout(() => {
                this.updateButtonStates(e.target);
            }, 10);
        }
        
        // Comentado: No cerrar modal al hacer clic afuera
        // if (e.target.classList.contains('modal')) {
        //     this.hideModal();
        //     return;
        // }

        // Verificar botón de cerrar modal específicamente
        if (e.target.id === 'modal-close' || e.target.classList.contains('close-btn')) {
            this.hideModal();
            return;
        }

        // Manejar clics en tareas para selección múltiple y edición inline
        const taskItem = e.target.closest('.task-item');
        if (taskItem) {
            const taskId = parseInt(taskItem.dataset.taskId);
            
            // Clic en el texto de la tarea: iniciar edición inline
            if (e.target.classList.contains('task-text') && !e.target.classList.contains('editing')) {
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                    this.startInlineEdit(taskId);
                    e.preventDefault();
                    return;
                }
            }
            
            // Manejo de selección múltiple para clics en contenido de tarea
            if (e.target.classList.contains('task-text') || e.target.classList.contains('task-content')) {
                if (e.ctrlKey || e.metaKey) {
                    // Ctrl+clic: alternar selección de esta tarea
                    this.toggleTaskSelection(taskId);
                    e.preventDefault();
                    return;
                } else if (e.shiftKey) {
                    if (this.lastSelectedTaskId) {
                        // Shift+clic: seleccionar rango
                        this.selectTaskRange(this.lastSelectedTaskId, taskId);
                    } else {
                        // Shift+clic sin selección previa: iniciar selección con esta tarea
                        this.toggleTaskSelection(taskId);
                    }
                    e.preventDefault();
                    return;
                } else if (!e.target.classList.contains('task-checkbox') && 
                           !e.target.classList.contains('task-toggle') &&
                           !e.target.closest('.task-actions') &&
                           !e.target.classList.contains('task-text')) {
                    // Clic normal: limpiar selección si no hay modificadores
                    this.clearSelection();
                }
            }
        }
        
        const actions = {
            'task-checkbox': () => this.toggleTaskCompletion(this.getTaskId(e.target)),
            'task-toggle': () => this.toggleTaskExpansion(this.getTaskId(e.target)),
            'add-subtask-btn': () => this.addEmptySubtask(this.getTaskId(e.target)),
            'edit-task-btn': () => this.showEditTaskModal(this.getTaskId(e.target)),
            'duplicate-btn': () => this.duplicateTask(this.getTaskId(e.target)),
            'delete-btn': () => this.deleteTask(this.getTaskId(e.target)),
            'subtask-btn': () => this.addSubtaskFromForm(e.target),
            'cancel-btn': () => this.hideSubtaskForm(e.target),
            'manage-btn': () => this.showModal(e.target.dataset.modal),
            'quick-date-btn': () => this.setQuickDate(e.target),
            'quick-alert-btn': () => this.setQuickAlert(e.target),
            'add-tag-btn': () => this.addTagFromInput(),
            'remove-tag': () => this.removeEditingTag(e.target.dataset.tag)
        };

        // Ejecutar acción si existe
        const action = Object.keys(actions).find(cls => e.target.classList.contains(cls));
        if (action) {
            e.preventDefault();
            e.stopPropagation();
            actions[action]();
        }
    }

    handleChange(e) {
        if (e.target.id === 'scenarioSelect') {
            this.currentScenario = parseInt(e.target.value);
            this.currentProject = this.getFirstProjectId();
            this.updateSelectors();
            this.render();
            this.updateAssistantContext();
        } else if (e.target.id === 'projectSelect') {
            this.currentProject = parseInt(e.target.value);
            this.render();
            this.updateAssistantContext();
        } else if (e.target.id === 'edit-task-repeat') {
            const repeatCountInput = document.getElementById('edit-task-repeat-count');
            if (e.target.value) {
                repeatCountInput.style.display = 'block';
                if (!repeatCountInput.value) {
                    repeatCountInput.value = '2';
                }
            } else {
                repeatCountInput.style.display = 'none';
                repeatCountInput.value = '';
            }
        }
    }

    handleSubmit(e) {
        e.preventDefault();
        
        const forms = {
            'addTaskForm': () => this.addTask(),
            'editTaskForm': () => this.handleEditTaskSubmit(),
            'itemForm': () => this.saveItem()
        };

        const formHandler = forms[e.target.id];
        if (formHandler) {
            formHandler();
        }
    }

    handleKeydown(e) {
        // Manejar Enter en el chat del asistente
        if (e.key === 'Enter' && e.target.id === 'chatInput') {
            e.preventDefault();
            this.sendMessage();
            return;
        }
        
        // Atajos de markdown para el editor de descripción
        if (e.target.classList.contains('markdown-editor-content')) {
            this.handleMarkdownShortcuts(e);
            
            // Actualizar estado de botones después de teclas de navegación
            setTimeout(() => {
                this.updateButtonStates(e.target);
            }, 10);
        }
        
        if (e.key === 'Enter' && e.target.classList.contains('subtask-input')) {
            e.preventDefault();
            e.stopPropagation();
            // Solo proceder si el input tiene contenido
            if (e.target.value.trim()) {
                const button = e.target.parentElement.querySelector('.subtask-btn');
                this.addSubtaskFromForm(button);
            }
        } else if (e.key === 'Escape' && e.target.classList.contains('subtask-input')) {
            e.preventDefault();
            e.stopPropagation();
            const button = e.target.parentElement.querySelector('.cancel-btn');
            this.hideSubtaskForm(button);
        } else if (e.key === 'Enter' && e.target.id === 'edit-task-tags') {
            e.preventDefault();
            this.addTagFromInput();
        } else if (e.key === 'Escape') {
            // Cerrar modal con tecla Escape
            const modal = document.getElementById('modal');
            if (modal && modal.style.display !== 'none') {
                this.hideModal();
            }
        }
    }

    handleSelectionChange() {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return;
        
        const activeElement = document.activeElement;
        if (activeElement && activeElement.classList.contains('markdown-editor-content')) {
            this.updateButtonStates(activeElement);
        }
    }

    handleInput(e) {
        // Eliminado: ya no hay conversión automática de URLs
    }

    handleBlur(e) {
        // Eliminado: ya no hay conversión automática de URLs
    }

    // === FUNCIONES MARKDOWN ===
    handleMarkdownShortcuts(e) {
        const { ctrlKey, shiftKey, key } = e;
        
        if (ctrlKey) {
            switch(key.toLowerCase()) {
                case 'b':
                    e.preventDefault();
                    this.applyHtmlFormat(e.target, 'bold');
                    break;
                case 'l':
                    if (!shiftKey) {
                        e.preventDefault();
                        this.applyHtmlFormat(e.target, 'italic');
                    } else {
                        e.preventDefault();
                        this.applyHtmlFormat(e.target, 'code');
                    }
                    break;
                case 'x':
                    if (shiftKey) {
                        e.preventDefault();
                        this.applyHtmlFormat(e.target, 'strikethrough');
                    }
                    break;
                case '7':
                    if (shiftKey) {
                        e.preventDefault();
                        this.applyHtmlFormat(e.target, 'ordered-list');
                    }
                    break;
                case '8':
                    if (shiftKey) {
                        e.preventDefault();
                        this.applyHtmlFormat(e.target, 'unordered-list');
                    }
                    break;
                case '.':
                    if (shiftKey) {
                        e.preventDefault();
                        this.applyHtmlFormat(e.target, 'quote');
                    }
                    break;
            }
        }
    }

    applyHtmlFormat(element, format) {
        element.focus();
        
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return;
        
        switch(format) {
            case 'bold':
                document.execCommand('bold', false, null);
                break;
            case 'italic':
                document.execCommand('italic', false, null);
                break;
            case 'strikethrough':
                document.execCommand('strikeThrough', false, null);
                break;
            case 'code':
                this.wrapSelectionWithElement('code');
                break;
            case 'link':
                this.createLinkFromSelection();
                break;
            case 'ordered-list':
                document.execCommand('insertOrderedList', false, null);
                break;
            case 'unordered-list':
                document.execCommand('insertUnorderedList', false, null);
                break;
            case 'quote':
                this.wrapSelectionWithElement('blockquote');
                break;
        }
        
        // Actualizar estado de botones después del formato
        this.updateButtonStates(element);
    }

    wrapSelectionWithElement(tagName) {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const selectedText = range.toString();
            
            if (selectedText) {
                const element = document.createElement(tagName);
                element.textContent = selectedText;
                range.deleteContents();
                range.insertNode(element);
                
                // Posicionar cursor después del elemento
                range.setStartAfter(element);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        }
    }

    updateButtonStates(element) {
        const toolbar = element.closest('.markdown-editor').querySelector('.markdown-toolbar');
        if (!toolbar) return;
        
        const buttons = toolbar.querySelectorAll('.markdown-btn');
        
        buttons.forEach(button => {
            const format = button.getAttribute('data-format');
            let isActive = false;
            
            switch(format) {
                case 'bold':
                    isActive = document.queryCommandState('bold');
                    break;
                case 'italic':
                    isActive = document.queryCommandState('italic');
                    break;
                case 'strikethrough':
                    isActive = document.queryCommandState('strikeThrough');
                    break;
                case 'code':
                    isActive = this.isSelectionInElement('code');
                    break;
                case 'ordered-list':
                    isActive = document.queryCommandState('insertOrderedList');
                    break;
                case 'unordered-list':
                    isActive = document.queryCommandState('insertUnorderedList');
                    break;
                case 'quote':
                    isActive = this.isSelectionInElement('blockquote');
                    break;
            }
            
            if (isActive) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
    }

    isSelectionInElement(tagName) {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return false;
        
        let node = selection.anchorNode;
        while (node) {
            if (node.nodeType === Node.ELEMENT_NODE && node.tagName.toLowerCase() === tagName.toLowerCase()) {
                return true;
            }
            node = node.parentNode;
        }
        return false;
    }

    createLinkFromSelection() {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return;
        
        const range = selection.getRangeAt(0);
        const selectedText = range.toString().trim();
        
        if (!selectedText) return;
        
        // Crear el enlace
        const link = document.createElement('a');
        link.href = selectedText;
        link.textContent = selectedText;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.style.color = '#3b82f6';
        link.style.textDecoration = 'underline';
        
        // Reemplazar la selección con el enlace
        range.deleteContents();
        range.insertNode(link);
        
        // Limpiar selección
        selection.removeAllRanges();
    }

    // === UTILIDADES OPTIMIZADAS ===
    getTaskId(element) {
        const taskItem = element.closest('.task-item');
        return taskItem ? parseInt(taskItem.dataset.taskId) : null;
    }

    getDataIndex(element) {
        return parseInt(element.dataset.idx);
    }

    getFirstProjectId() {
        return parseInt(Object.keys(this.data[this.currentScenario]?.projects || {})[0]) || 1;
    }

    getCurrentTasks() {
        return this.data[this.currentScenario]?.projects[this.currentProject]?.tasks || [];
    }

    getAllTasks(tasks = null) {
        const searchTasks = tasks || this.getCurrentTasks();
        const result = searchTasks.reduce((all, task) => {
            all.push(task);
            all.push(...this.getAllTasks(task.children));
            return all;
        }, []);
        return result;
    }

    findTaskById(taskId, tasks = null) {
        const searchTasks = tasks || this.getCurrentTasks();
        
        for (let task of searchTasks) {
            if (task.id === taskId) return task;
            const found = this.findTaskById(taskId, task.children);
            if (found) return found;
        }
        return null;
    }

    // === GENERACIÓN DE IDS ÚNICOS ===
    generateUniqueId() {
        return this.taskIdCounter++;
    }

    // === GESTIÓN DE TAREAS CORREGIDA ===
    addTask(parentId = null, text = null) {
        const input = text || document.getElementById('taskInput').value.trim();
        if (!input) return;

        const taskId = this.generateUniqueId();

        const task = {
            id: taskId,
            text: input,
            completed: false,
            parentId,
            children: [],
            expanded: true,
            depth: this.calculateDepth(parentId),
            priority: 'media',
            description: '',
            dueDate: null,
            repeat: null,
            repeatCount: null,
            tags: []
        };
        
        if (parentId) {
            const parent = this.findTaskById(parentId);
            if (parent) {
                parent.children.push(task);
                parent.expanded = true;
            }
        } else {
            this.getCurrentTasks().push(task);
            if (!text) document.getElementById('taskInput').value = '';
        }

        this.saveAndRender();
        return task;
    }

    calculateDepth(parentId) {
        if (!parentId) return 0;
        const parent = this.findTaskById(parentId);
        return parent ? parent.depth + 1 : 0;
    }

    toggleTaskCompletion(taskId) {
        const task = this.findTaskById(taskId);
        if (task) {
            task.completed = !task.completed;
            this.updateChildrenCompletion(task, task.completed);
            this.saveAndRender();
        }
    }

    updateChildrenCompletion(task, completed) {
        task.children.forEach(child => {
            child.completed = completed;
            this.updateChildrenCompletion(child, completed);
        });
    }

    toggleTaskExpansion(taskId) {
        const task = this.findTaskById(taskId);
        if (task?.children.length > 0) {
            task.expanded = !task.expanded;
            this.saveAndRender();
        }
    }

    // === NUEVA FUNCIONALIDAD: DUPLICAR TAREAS ===
    duplicateTask(taskId) {
        const originalTask = this.findTaskById(taskId);
        if (!originalTask) return;

        const duplicatedTask = this.createTaskCopy(originalTask);
        
        // Insertar la tarea duplicada justo después de la original
        if (originalTask.parentId) {
            const parent = this.findTaskById(originalTask.parentId);
            if (parent) {
                const index = parent.children.findIndex(child => child.id === taskId);
                parent.children.splice(index + 1, 0, duplicatedTask);
            }
        } else {
            const currentTasks = this.getCurrentTasks();
            const index = currentTasks.findIndex(task => task.id === taskId);
            currentTasks.splice(index + 1, 0, duplicatedTask);
        }

        this.saveAndRender();
        
        // Mostrar feedback visual
        setTimeout(() => {
            const taskElement = document.querySelector(`[data-task-id="${duplicatedTask.id}"]`);
            if (taskElement) {
                taskElement.classList.add('success-flash');
                setTimeout(() => taskElement.classList.remove('success-flash'), 500);
            }
        }, 100);
    }

    createTaskCopy(originalTask) {
        const newId = this.generateUniqueId();
        const copy = {
            id: newId,
            text: `${originalTask.text} (copia)`,
            completed: false, // Las copias siempre inician como no completadas
            parentId: originalTask.parentId,
            children: this.copyChildren(originalTask.children),
            expanded: originalTask.expanded,
            depth: originalTask.depth,
            priority: originalTask.priority || 'media',
            description: originalTask.description || '',
            dueDate: originalTask.dueDate || null,
            repeat: originalTask.repeat || null,
            repeatCount: originalTask.repeatCount || null,
            tags: originalTask.tags ? [...originalTask.tags] : []
        };

        // Actualizar parentId de los hijos copiados
        this.updateChildrenParentIds(copy.children, copy.id);
        
        return copy;
    }

    copyChildren(children) {
        return children.map(child => {
            const childId = this.generateUniqueId();
            return {
                id: childId,
                text: child.text,
                completed: false, // Los hijos copiados también inician como no completados
                parentId: null, // Se actualizará después
                children: this.copyChildren(child.children),
                expanded: child.expanded,
                depth: child.depth,
                priority: child.priority || 'media',
                description: child.description || '',
                dueDate: child.dueDate || null,
                repeat: child.repeat || null,
                repeatCount: child.repeatCount || null,
                tags: child.tags ? [...child.tags] : []
            };
        });
    }

    updateChildrenParentIds(children, newParentId) {
        children.forEach(child => {
            child.parentId = newParentId;
            if (child.children.length > 0) {
                this.updateChildrenParentIds(child.children, child.id);
            }
        });
    }

    deleteTask(taskId) {
        if (confirm('¿Estás seguro de que quieres eliminar esta tarea y todas sus subtareas?')) {
            this.removeTaskById(taskId);
            this.saveAndRender();
        }
    }

    removeTaskById(taskId) {
        const currentTasks = this.getCurrentTasks();
        this.data[this.currentScenario].projects[this.currentProject].tasks = 
            this.filterTasks(currentTasks, taskId);
    }

    filterTasks(tasks, excludeId) {
        return tasks.filter(task => {
            if (task.id === excludeId) return false;
            task.children = this.filterTasks(task.children, excludeId);
            return true;
        });
    }

    // === FORMULARIOS DE SUBTAREAS ===
    addEmptySubtask(parentId) {
        // Crear subtarea vacía inmediatamente
        const taskId = this.generateUniqueId();
        const task = {
            id: taskId,
            text: 'Nueva subtarea',
            completed: false,
            parentId,
            children: [],
            expanded: true,
            depth: this.calculateDepth(parentId),
            priority: 'media',
            description: '',
            dueDate: null,
            repeat: null,
            repeatCount: null,
            tags: []
        };
        
        const parent = this.findTaskById(parentId);
        if (parent) {
            parent.children.push(task);
            parent.expanded = true;
        }
        
        this.saveAndRender();
        
        // Activar edición inline inmediatamente
        setTimeout(() => {
            this.startInlineEdit(taskId);
        }, 100);
    }

    showSubtaskForm(parentId) {
        const form = document.querySelector(`[data-parent="${parentId}"]`);
        if (form) {
            form.classList.add('show');
            form.querySelector('.subtask-input').focus();
        }
    }

    addSubtaskFromForm(button) {
        // Evitar doble ejecución
        if (this.isProcessingSubtask) return;
        this.isProcessingSubtask = true;
        
        const form = button.closest('.subtask-form');
        const input = form.querySelector('.subtask-input');
        const parentId = parseInt(form.dataset.parent);
        
        const taskText = input.value.trim();
        
        if (taskText) {
            // Limpiar input y ocultar formulario INMEDIATAMENTE
            input.value = '';
            this.hideSubtaskForm(button);
            
            // Luego agregar la tarea
            this.addTask(parentId, taskText);
        }
        
        // Resetear bandera después de un pequeño delay
        setTimeout(() => {
            this.isProcessingSubtask = false;
        }, 100);
    }

    hideSubtaskForm(button) {
        const form = button.closest('.subtask-form');
        if (form) {
            form.classList.remove('show');
            form.querySelector('.subtask-input').value = '';
        }
    }

    // === DRAG & DROP NATIVO YY-TREE ===
    initializeDragAndDrop() {
        console.log('🎯 Inicializando sistema de drag & drop nativo YY-Tree');
        
        // Limpiar event listeners previos
        this.cleanupDragAndDrop();
        
        // Inicializar variables de drag
        this.hoverTimeout = null;
        this.currentHoverTarget = null;
        this.activeDropZone = null;
        this.hoverStartTime = null;
        this.HOVER_DELAY = 1000; // 1 segundo
        
        // Agregar event listeners a todos los drag handles
        document.querySelectorAll('.drag-handle').forEach(handle => {
            handle.addEventListener('mousedown', this.handleDragStart.bind(this));
            handle.addEventListener('touchstart', this.handleDragStart.bind(this), { passive: false });
        });
    }

    cleanupDragAndDrop() {
        // Limpiar event listeners antiguos
        document.querySelectorAll('.drag-handle').forEach(handle => {
            handle.replaceWith(handle.cloneNode(true));
        });
        
        // Limpiar drop zones existentes
        document.querySelectorAll('.simple-drop-zone').forEach(zone => {
            zone.remove();
        });
    }

    handleDragStart(e) {
        e.preventDefault();
        
        const taskItem = e.target.closest('.task-item');
        if (!taskItem) return;
        
        const taskId = parseInt(taskItem.dataset.taskId);
        const task = this.findTaskById(taskId);
        
        if (!task) return;
        
        console.log('🎯 Iniciando drag para tarea:', task.text);
        
        // Crear elemento de preview
        this.createDragPreview(task, e);
        
        // Configurar estado de dragging
        this.draggingTask = task;
        this.dragStartPos = { x: e.clientX || e.touches[0].clientX, y: e.clientY || e.touches[0].clientY };
        
        // Event listeners para el movimiento
        const moveHandler = this.handleDragMove.bind(this);
        const endHandler = this.handleDragEnd.bind(this);
        
        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', endHandler);
        document.addEventListener('touchmove', moveHandler, { passive: false });
        document.addEventListener('touchend', endHandler);
        
        // Guardar handlers para poder removerlos después
        this.currentMoveHandler = moveHandler;
        this.currentEndHandler = endHandler;
        
        // Marcar el elemento como siendo arrastrado
        taskItem.classList.add('being-dragged');
        document.body.classList.add('dragging-active');
        
        // Crear zonas de drop dinámicas
        this.createDynamicDropZones();
    }

    createDragPreview(task, e) {
        const preview = document.createElement('div');
        preview.className = 'drag-preview';
        preview.innerHTML = `
            <div class="drag-preview-content">
                <span class="drag-preview-icon">📝</span>
                <span class="drag-preview-text">${this.escapeHtml(task.text)}</span>
            </div>
        `;
        
        preview.style.position = 'fixed';
        preview.style.pointerEvents = 'none';
        preview.style.zIndex = '10000';
        preview.style.left = (e.clientX || e.touches[0].clientX) + 10 + 'px';
        preview.style.top = (e.clientY || e.touches[0].clientY) - 20 + 'px';
        
        document.body.appendChild(preview);
        this.dragPreview = preview;
    }

    createDynamicDropZones() {
        // Crear zonas de drop para cada tarea que no sea la que se está arrastrando
        const allTaskItems = document.querySelectorAll('.task-item');
        
        allTaskItems.forEach(taskItem => {
            const taskId = parseInt(taskItem.dataset.taskId);
            
            // No crear zona para la tarea que se está arrastrando
            if (taskId === this.draggingTask.id) return;
            
            // Verificar que no sea descendiente de la tarea que se arrastra
            if (this.isDescendant(this.findTaskById(taskId), this.draggingTask)) return;
            
            this.createTaskDropZone(taskItem);
        });
        
        // Crear zona para reordenamiento entre tareas del mismo nivel
        this.createReorderDropZones();
    }

    createTaskDropZone(taskItem) {
        const taskId = taskItem.dataset.taskId;
        
        // Crear zona de drop para convertir en subtarea
        const dropZone = document.createElement('div');
        dropZone.className = 'simple-drop-zone task-drop-zone';
        dropZone.dataset.taskId = taskId;
        dropZone.dataset.dropType = 'subtask';
        dropZone.innerHTML = `
            <div class="drop-zone-content">
                <span class="drop-icon">↳</span>
                <span class="drop-text">Convertir en subtarea</span>
            </div>
        `;
        
        // Insertar después del task-content
        const taskContent = taskItem.querySelector('.task-content');
        const subtaskForm = taskItem.querySelector('.subtask-form');
        
        if (subtaskForm) {
            this.safeInsertBefore(taskItem, dropZone, subtaskForm);
        } else {
            this.safeInsertBefore(taskContent.parentNode, dropZone, taskContent.nextSibling);
        }
        
        this.activateDropZone(dropZone);
    }

    // Función helper para insertBefore seguro
    safeInsertBefore(parent, newNode, referenceNode) {
        try {
            // Verificar que el padre y el nodo de referencia existan
            if (!parent || !newNode) return false;
            
            // Si no hay nodo de referencia, agregar al final
            if (!referenceNode) {
                parent.appendChild(newNode);
                return true;
            }
            
            // Verificaciones más exhaustivas
            if (!parent.contains(referenceNode)) {
                parent.appendChild(newNode);
                return true;
            }
            
            // Verificar que referenceNode tenga un parentNode y sea el mismo que parent
            if (referenceNode.parentNode !== parent) {
                parent.appendChild(newNode);
                return true;
            }
            
            // Verificar que referenceNode aún esté conectado al DOM
            if (!document.contains(referenceNode)) {
                parent.appendChild(newNode);
                return true;
            }
            
            parent.insertBefore(newNode, referenceNode);
            return true;
        } catch (error) {
            console.warn('Error en insertBefore, usando appendChild:', error);
            try {
                if (parent && newNode && document.contains(parent)) {
                    parent.appendChild(newNode);
                    return true;
                }
            } catch (appendError) {
                console.error('Error también en appendChild:', appendError);
            }
            return false;
        }
    }

    createReorderDropZones() {
        const taskList = document.getElementById('taskList');
        const allTasks = Array.from(taskList.querySelectorAll('.task-item'));
        
        // Agrupar tareas por nivel de profundidad
        const tasksByDepth = {};
        allTasks.forEach(task => {
            const depth = parseInt(task.dataset.depth) || 0;
            if (!tasksByDepth[depth]) tasksByDepth[depth] = [];
            tasksByDepth[depth].push(task);
        });
        
        // Solo crear zonas para tareas de nivel 0 (tareas principales)
        const mainTasks = tasksByDepth[0] || [];
        
        // Crear zonas antes de cada tarea principal y después de la última
        mainTasks.forEach((mainTask, index) => {
            const mainTaskId = parseInt(mainTask.dataset.taskId);
            
            // No crear zonas para la tarea que se está arrastrando
            if (mainTaskId === this.draggingTask.id) return;
            
            // Crear zona ANTES de cada tarea principal
            if (taskList.contains(mainTask)) {
                this.createReorderDropZone(taskList, 'before', mainTask, mainTaskId);
            }
            
            // Si es la última tarea principal, crear zona después
            if (index === mainTasks.length - 1) {
                const lastElementOfTask = this.findLastElementOfTask(mainTask, allTasks);
                if (lastElementOfTask && taskList.contains(lastElementOfTask)) {
                    this.createReorderDropZone(taskList, 'after', lastElementOfTask, mainTaskId);
                }
            }
        });
    }
    
    findLastElementOfTask(mainTask, allTasks) {
        const mainTaskId = parseInt(mainTask.dataset.taskId);
        const mainTaskIndex = allTasks.indexOf(mainTask);
        
        // Buscar desde esta tarea hacia adelante hasta encontrar una tarea del mismo nivel o el final
        let lastElement = mainTask;
        
        for (let i = mainTaskIndex + 1; i < allTasks.length; i++) {
            const currentTask = allTasks[i];
            const currentDepth = parseInt(currentTask.dataset.depth) || 0;
            
            // Si encontramos una tarea del mismo nivel (depth 0), paramos
            if (currentDepth === 0) break;
            
            // Si es una subtarea de esta tarea, actualizamos el último elemento
            lastElement = currentTask;
        }
        
        return lastElement;
    }
    
    createReorderDropZone(container, position, referenceTask, referenceId = null) {
        const taskId = referenceId || parseInt(referenceTask.dataset.taskId);
        
        const dropZone = document.createElement('div');
        dropZone.className = 'simple-drop-zone reorder-drop-zone';
        dropZone.dataset.dropType = 'reorder';
        dropZone.dataset.position = position;
        dropZone.dataset.referenceId = taskId;
        dropZone.innerHTML = `
            <div class="drop-zone-content">
                <span class="drop-icon">${position === 'before' ? '↑' : '↓'}</span>
                <span class="drop-text">Mover aquí</span>
            </div>
        `;
        
        if (position === 'before') {
            this.safeInsertBefore(container, dropZone, referenceTask);
        } else {
            // Para 'after', insertar después del elemento de referencia
            const nextSibling = referenceTask.nextSibling;
            if (nextSibling) {
                this.safeInsertBefore(container, dropZone, nextSibling);
            } else {
                container.appendChild(dropZone);
            }
        }
        
        this.activateDropZone(dropZone);
    }

    activateDropZone(dropZone) {
        dropZone.classList.add('active');
        dropZone.style.display = 'block';
        dropZone.style.opacity = '1';
    }

    handleDragMove(e) {
        if (!this.draggingTask || !this.dragPreview) return;
        
        e.preventDefault();
        
        const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
        const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
        
        // Actualizar posición del preview
        this.dragPreview.style.left = clientX + 10 + 'px';
        this.dragPreview.style.top = clientY - 20 + 'px';
        
        // Auto-scroll cuando se arrastra cerca de los bordes
        this.handleAutoScroll(clientY);
        
        // Detectar zona de drop bajo el cursor
        const elementBelow = document.elementFromPoint(clientX, clientY);
        const dropZone = elementBelow?.closest('.simple-drop-zone');
        
        // Limpiar highlights previos
        document.querySelectorAll('.simple-drop-zone.highlighted').forEach(zone => {
            zone.classList.remove('highlighted');
        });
        
        // Highlight zona actual
        if (dropZone && dropZone.classList.contains('active')) {
            dropZone.classList.add('highlighted');
        }
    }

    handleAutoScroll(clientY) {
        const scrollThreshold = 50; // Distancia del borde para activar scroll
        const scrollSpeed = 5; // Velocidad de scroll
        const viewportHeight = window.innerHeight;
        
        // Limpiar cualquier auto-scroll previo
        if (this.autoScrollInterval) {
            clearInterval(this.autoScrollInterval);
            this.autoScrollInterval = null;
        }
        
        // Verificar si necesitamos scroll hacia arriba
        if (clientY < scrollThreshold) {
            this.autoScrollInterval = setInterval(() => {
                window.scrollBy(0, -scrollSpeed);
            }, 16); // ~60fps
        }
        // Verificar si necesitamos scroll hacia abajo
        else if (clientY > viewportHeight - scrollThreshold) {
            this.autoScrollInterval = setInterval(() => {
                window.scrollBy(0, scrollSpeed);
            }, 16); // ~60fps
        }
    }

    handleDragEnd(e) {
        if (!this.draggingTask) return;
        
        console.log('🎯 Finalizando drag');
        
        const clientX = e.clientX || e.changedTouches[0].clientX;
        const clientY = e.clientY || e.changedTouches[0].clientY;
        
        // Encontrar zona de drop
        const elementBelow = document.elementFromPoint(clientX, clientY);
        const dropZone = elementBelow?.closest('.simple-drop-zone.active');
        
        if (dropZone) {
            this.handleDrop(dropZone);
        }
        
        // Cleanup
        this.cleanupDragState();
    }

    handleDrop(dropZone) {
        const dropType = dropZone.dataset.dropType;
        const task = this.draggingTask;
        
        console.log('🎯 Procesando drop:', dropType);
        
        if (dropType === 'subtask') {
            const newParentId = parseInt(dropZone.dataset.taskId);
            if (newParentId && newParentId !== task.id) {
                console.log('🎯 Convirtiendo en subtarea de:', newParentId);
                this.convertToSubtask(task.id, newParentId);
            }
        } else if (dropType === 'reorder') {
            const referenceId = parseInt(dropZone.dataset.referenceId);
            const position = dropZone.dataset.position;
            console.log('🎯 Reordenando tarea:', position, referenceId);
            this.reorderTask(task.id, referenceId, position);
        }
    }

    reorderTask(taskId, referenceId, position) {
        const task = this.findTaskById(taskId);
        const referenceTask = this.findTaskById(referenceId);
        
        if (!task || !referenceTask) return;
        
        // Remover tarea de su ubicación actual
        this.removeTaskFromParent(task);
        
        // Encontrar el contenedor del nivel actual (main tasks o children de un padre)
        const referenceParent = this.findParentTask(referenceTask);
        let targetContainer;
        
        if (referenceParent) {
            targetContainer = referenceParent.children;
            task.parentId = referenceParent.id;
            task.depth = referenceParent.depth + 1;
        } else {
            targetContainer = this.getCurrentTasks();
            task.parentId = null;
            task.depth = 0;
        }
        
        // Encontrar posición de referencia
        const referenceIndex = targetContainer.findIndex(t => t.id === referenceId);
        
        if (referenceIndex !== -1) {
            if (position === 'before') {
                targetContainer.splice(referenceIndex, 0, task);
            } else {
                targetContainer.splice(referenceIndex + 1, 0, task);
            }
        } else {
            targetContainer.push(task);
        }
        
        // Actualizar jerarquía de hijos
        this.updateChildrenDepth(task);
        
        this.saveAndRender();
    }

    convertToSubtask(taskId, newParentId) {
        console.log(`🎯 Converting task ${taskId} to subtask of ${newParentId}`);
        
        const task = this.findTaskById(taskId);
        const newParent = this.findTaskById(newParentId);
        
        if (!task || !newParent || task.id === newParentId) {
            console.error('🚫 Task or parent not found, or trying to make task child of itself');
            return;
        }

        // Verificar que no sea un padre tratando de ser hijo de su propio descendiente
        if (this.isDescendant(newParent, task)) {
            alert('No puedes mover una tarea dentro de sus propias subtareas');
            return;
        }

        // Remover tarea de su ubicación actual
        this.removeTaskFromParent(task);

        // Agregar como subtarea del nuevo padre
        newParent.children.push(task);
        newParent.expanded = true;

        // Actualizar jerarquía
        this.updateTaskHierarchy(task, newParentId);

        this.saveAndRender();
    }

    isDescendant(potentialDescendant, ancestor) {
        if (!ancestor.children) return false;
        
        for (const child of ancestor.children) {
            if (child.id === potentialDescendant.id) return true;
            if (this.isDescendant(potentialDescendant, child)) return true;
        }
        
        return false;
    }

    cleanupDragState() {
        // Limpiar preview
        if (this.dragPreview) {
            this.dragPreview.remove();
            this.dragPreview = null;
        }
        
        // Limpiar hover timer
        if (this.hoverTimeout) {
            clearTimeout(this.hoverTimeout);
            this.hoverTimeout = null;
        }
        
        // Limpiar auto-scroll
        if (this.autoScrollInterval) {
            clearInterval(this.autoScrollInterval);
            this.autoScrollInterval = null;
        }
        
        // Limpiar estado de hover
        this.currentHoverTarget = null;
        this.hoverStartTime = null;
        
        // Limpiar estado
        this.draggingTask = null;
        this.dragStartPos = null;
        
        // Remover event listeners
        if (this.currentMoveHandler) {
            document.removeEventListener('mousemove', this.currentMoveHandler);
            document.removeEventListener('touchmove', this.currentMoveHandler);
        }
        if (this.currentEndHandler) {
            document.removeEventListener('mouseup', this.currentEndHandler);
            document.removeEventListener('touchend', this.currentEndHandler);
        }
        
        // Remover clases CSS
        document.querySelectorAll('.being-dragged').forEach(item => {
            item.classList.remove('being-dragged');
        });
        document.body.classList.remove('dragging-active');
        
        // Remover todas las drop zones
        document.querySelectorAll('.simple-drop-zone').forEach(zone => {
            zone.remove();
        });
    }

    // Mantener funciones auxiliares existentes
    removeTaskFromParent(task) {
        if (task.parentId) {
            const parent = this.findTaskById(task.parentId);
            if (parent) {
                parent.children = parent.children.filter(child => child.id !== task.id);
            }
        } else {
            const currentTasks = this.getCurrentTasks();
            const index = currentTasks.findIndex(t => t.id === task.id);
            if (index !== -1) {
                currentTasks.splice(index, 1);
            }
        }
    }

    updateTaskHierarchy(task, newParentId) {
        task.parentId = newParentId;
        task.depth = this.calculateDepth(newParentId);
        
        // Actualizar profundidad de todos los hijos recursivamente
        this.updateChildrenDepth(task);
    }

    updateChildrenDepth(task) {
        task.children.forEach(child => {
            child.depth = task.depth + 1;
            child.parentId = task.id;
            this.updateChildrenDepth(child);
        });
    }

    // === RENDERIZADO OPTIMIZADO ===
    render() {
        this.renderTasks();
        this.updateStats();
        this.updateFilterTags();
        this.updateExpandCollapseControlVisibility();
        this.updateTaskSelectionStyles();
        
        // Inicializar drag & drop después del renderizado
        setTimeout(() => {
            this.initializeDragAndDrop();
        }, 100);
    }

    renderTasks() {
        const taskList = document.getElementById('taskList');
        const emptyState = document.getElementById('emptyState');
        
        // Obtener tareas filtradas manteniendo jerarquía
        const tasksToRender = this.getFilteredTasksHierarchical();
        
        if (tasksToRender.length === 0) {
            taskList.style.display = 'none';
            emptyState.style.display = 'block';
        } else {
            taskList.style.display = 'block';
            emptyState.style.display = 'none';
            const html = this.renderTasksHTML(tasksToRender);
            taskList.innerHTML = html;
        }
    }

    getFilteredTasksHierarchical() {
        // Si vista es "all" y no hay filtros de etiquetas ni ordenamiento, mantener jerarquía
        if (this.currentFilter === 'all' && this.activeTagFilters.size === 0 && this.activeSortingFilters.size === 0) {
            return this.getCurrentTasks().filter(task => !task.parentId);
        }
        
        // Para cualquier otro caso (filtros de vista, etiquetas, o ordenamiento), usar filtros unificados
        const allFilteredTasks = this.getFilteredTasks();
        
        // Si es vista "all" con ordenamiento pero sin otros filtros, mantener jerarquía
        if (this.currentFilter === 'all' && this.activeTagFilters.size === 0 && this.activeSortingFilters.size > 0) {
            // Filtrar solo tareas de nivel superior y aplicar ordenamiento
            return allFilteredTasks.filter(task => !task.parentId);
        }
        
        // Para otros filtros de vista, convertir en elementos de nivel superior (sin jerarquía)
        return allFilteredTasks.map(task => ({
            ...task,
            children: [], // Eliminar hijos para mostrar como elemento independiente
            parentId: null, // Convertir en tarea de nivel superior
            depth: 0 // Resetear profundidad
        }));
    }

    renderTasksHTML(tasks) {
        return tasks.map(task => this.renderTaskHTML(task)).join('');
    }

    renderTaskHTML(task) {
        const hasChildren = task.children.length > 0;
        const toggleClass = hasChildren ? (task.expanded ? 'expanded' : 'collapsed') : '';
        const childrenHTML = task.expanded ? this.renderTasksHTML(task.children) : '';
        
        // Generar badges unificados
        const badges = this.generateTaskBadges(task);
        
        return `
            <li class="task-item" data-task-id="${task.id}" data-depth="${task.depth}">
                <div class="task-content ${task.completed ? 'completed' : ''}" style="--depth: ${task.depth}">
                    <div class="drag-handle">⋮⋮</div>
                    ${hasChildren 
                        ? `<div class="task-toggle ${toggleClass}"></div>` 
                        : '<div class="task-toggle" style="visibility: hidden;"></div>'
                    }
                    <div class="task-checkbox ${task.completed ? 'completed' : ''}"></div>
                    <div class="task-text ${task.completed ? 'completed' : ''}">
                        <span class="task-id-badge">ID:${task.id}</span>
                        ${this.escapeHtml(task.text)}${badges}
                    </div>
                    <div class="task-actions">
                        <button class="action-btn add-subtask-btn">+ Subtarea</button>
                        <button class="action-btn edit-task-btn">✏️ Editar</button>
                        <button class="action-btn duplicate-btn">📋 Duplicar</button>
                        <button class="action-btn delete-btn">🗑️</button>
                    </div>
                </div>
                <div class="subtask-form" data-parent="${task.id}" style="--depth: ${task.depth}">
                    <input type="text" class="subtask-input" placeholder="Nueva subtarea...">
                    <button class="subtask-btn">Añadir</button>
                    <button class="cancel-btn">Cancelar</button>
                </div>
                ${hasChildren ? `<ul class="children ${!task.expanded ? 'hidden' : ''}">${childrenHTML}</ul>` : ''}
            </li>
        `;
    }

    generateTaskBadges(task) {
        let badges = '';
        
        if (task.dueDate) {
            const badgeData = this.getDateBadges(task.dueDate);
            badges += badgeData.map(badge => 
                `<span class="${badge.className}">${badge.icon} ${badge.text}</span>`
            ).join('');
        }
        
        if (task.tags?.length) {
            badges += task.tags.map(tag => {
                const tagText = typeof tag === 'string' ? tag : tag.text;
                return `<span class="tag-item" style="margin-left: 4px;">🏷️ ${tagText}</span>`;
            }).join('');
        }
        
        // Badge de prioridad al final
        if (task.priority) {
            const priorityBadge = this.getPriorityBadge(task.priority);
            badges += `<span class="${priorityBadge.className}">${priorityBadge.icon} ${priorityBadge.text}</span>`;
        }
        
        return badges;
    }

    getPriorityBadge(priority) {
        const priorityConfig = {
            'alta': {
                className: 'priority-badge priority-high',
                icon: '🔴',
                text: 'Alta'
            },
            'baja': {
                className: 'priority-badge priority-low', 
                icon: '🟢',
                text: 'Baja'
            }
        };
        
        return priorityConfig[priority] || {
            className: 'priority-badge priority-medium',
            icon: '🟡',
            text: 'Media'
        };
    }

    getDateBadges(dueDate) {
        const badges = [];
        const dueDateInfo = this.getDueDateInfo(dueDate);
        const daysRemaining = this.calculateDaysRemaining(dueDate);
        
        // Badge principal de fecha
        if (dueDateInfo) {
            badges.push({
                className: `date-info-badge ${dueDateInfo.class}`,
                icon: '🕐',
                text: dueDateInfo.text
            });
        }
        
        // Badge de días restantes (siempre mostrar, con tiempo detallado para "Hoy")
        const daysBadge = this.getDaysRemainingBadge(daysRemaining, dueDate);
        if (daysBadge) {
            badges.push({
                className: `days-remaining-badge ${daysBadge.className}`,
                icon: '📅',
                text: daysBadge.text
            });
        }
        
        return badges;
    }

    updateStats() {
        const allTasks = this.getAllTasks();
        const completed = allTasks.filter(task => task.completed);
        const pending = allTasks.filter(task => !task.completed);

        document.getElementById('totalTasks').textContent = allTasks.length;
        document.getElementById('completedTasks').textContent = completed.length;
        document.getElementById('pendingTasks').textContent = pending.length;
    }

    // === GESTIÓN DE MODALES UNIFICADA ===
    showModal(type) {
        const modal = document.getElementById('modal');
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');
        
        const modalConfigs = {
            scenario: {
                title: 'Gestionar Escenarios',
                content: this.getItemModalContent('scenario')
            },
            project: {
                title: 'Gestionar Proyectos', 
                content: this.getItemModalContent('project')
            },
            editTask: {
                title: 'Editar Tarea',
                content: this.getEditTaskModalContent()
            }
        };
        
        const config = modalConfigs[type];
        if (config) {
            title.textContent = config.title;
            body.innerHTML = config.content;
            modal.style.display = 'block';
            
            // Renderizar listas específicas
            if (type === 'scenario') this.renderItemsList('scenario');
            if (type === 'project') this.renderItemsList('project');
        }
    }

    hideModal() {
        document.getElementById('modal').style.display = 'none';
        this.editingItemId = null;
    }

    getItemModalContent(type) {
        const singular = type === 'scenario' ? 'Escenario' : 'Proyecto';
        const buttonText = type === 'scenario' ? 'Agregar Escenario' : 'Agregar Proyecto';
        
        return `
            <div style="display: flex; gap: 12px; margin-bottom: 16px;">
                <button class="add-item-btn" onclick="taskManager.showItemForm('${type}')">+ ${buttonText}</button>
                <button class="add-item-btn" onclick="taskManager.importItem('${type}')" style="background: linear-gradient(135deg, #f59e0b, #d97706);" title="Importar">📤 Importar</button>
            </div>
            <div id="${type}sList" class="items-list"></div>
            
            <form id="itemForm" class="add-item-form" style="display: none;">
                <h4 id="form-title">Nuevo ${singular}</h4>
                <input type="text" id="item-name" placeholder="Nombre del ${type}" maxlength="30" required>
                <input type="text" id="item-icon" placeholder="Emoji (ej: 🏠)" maxlength="2">
                <input type="text" id="item-description" placeholder="Descripción (opcional)" maxlength="100">
                ${type === 'project' ? `
                <div class="form-section">
                    <label class="form-label">Detalles</label>
                    <div class="markdown-editor">
                        <div class="markdown-toolbar">
                            <button type="button" class="markdown-btn" data-format="bold" title="Negrita (Ctrl+B)"><b>B</b></button>
                            <button type="button" class="markdown-btn" data-format="italic" title="Cursiva (Ctrl+L)"><i>I</i></button>
                            <button type="button" class="markdown-btn" data-format="strikethrough" title="Tachado (Ctrl+Shift+X)"><s>S</s></button>
                            <button type="button" class="markdown-btn" data-format="code" title="Código (Ctrl+Shift+L)">&lt;/&gt;</button>
                            <button type="button" class="markdown-btn" data-format="link" title="Convertir en enlace">🔗</button>
                            <button type="button" class="markdown-btn" data-format="ordered-list" title="Lista numerada (Ctrl+Shift+7)">1.</button>
                            <button type="button" class="markdown-btn" data-format="unordered-list" title="Lista con viñetas (Ctrl+Shift+8)">•</button>
                            <button type="button" class="markdown-btn" data-format="quote" title="Cita (Ctrl+Shift+.)">"</button>
                        </div>
                        <div id="item-details" class="markdown-editor-content" contenteditable="true" data-placeholder="Detalles del proyecto (opcional)"></div>
                    </div>
                </div>
                ` : ''}
                <input type="hidden" id="item-type" value="${type}">
                <div class="form-buttons">
                    <button type="submit">Guardar</button>
                    <button type="button" onclick="taskManager.hideItemForm()">Cancelar</button>
                </div>
            </form>
            
            <input type="file" id="importFileInput" accept=".json" style="display: none;" onchange="taskManager.handleImportFile(event, '${type}')">
        `;
    }

    renderItemsList(type) {
        const list = document.getElementById(`${type}sList`);
        const items = type === 'scenario' 
            ? Object.values(this.data)
            : Object.values(this.data[this.currentScenario]?.projects || {});
        
        list.innerHTML = items.map(item => `
            <div class="item-card">
                <div class="item-info">
                    <div class="item-icon">${item.icon}</div>
                    <div class="item-details">
                        <h4>${item.name}</h4>
                        <p>${item.description}</p>
                    </div>
                </div>
                <div class="item-actions">
                    <button class="item-action-btn export-btn" onclick="taskManager.exportItem('${type}', '${item.id}')" title="Exportar">📥</button>
                    ${(type === 'scenario' && item.id !== 1) || (type === 'project' && item.id !== 1) ? `
                        <button class="item-action-btn edit-btn" onclick="taskManager.editItem('${type}', '${item.id}')">Editar</button>
                        <button class="item-action-btn delete-btn" onclick="taskManager.deleteItem('${type}', '${item.id}')">Eliminar</button>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }

    // === CRUD UNIFICADO ===
    showItemForm(type) {
        const form = document.getElementById('itemForm');
        const title = document.getElementById('form-title');
        const singular = type === 'scenario' ? 'Escenario' : 'Proyecto';
        
        title.textContent = this.editingItemId ? `Editar ${singular}` : `Nuevo ${singular}`;
        form.style.display = 'block';
        document.getElementById('item-name').focus();
    }

    hideItemForm() {
        const form = document.getElementById('itemForm');
        form.style.display = 'none';
        this.editingItemId = null;
        this.clearItemForm();
    }

    clearItemForm() {
        ['item-name', 'item-icon', 'item-description'].forEach(id => {
            document.getElementById(id).value = '';
        });
    }

    editItem(type, itemId) {
        const item = type === 'scenario' 
            ? this.data[itemId]
            : this.data[this.currentScenario]?.projects[itemId];
            
        if (item) {
            this.editingItemId = itemId;
            this.fillItemForm(item);
            this.showItemForm(type);
        }
    }

    fillItemForm(item) {
        document.getElementById('item-name').value = item.name;
        document.getElementById('item-icon').value = item.icon;
        document.getElementById('item-description').value = item.description;
        
        // Para proyectos, cargar también los detalles
        const detailsElement = document.getElementById('item-details');
        if (detailsElement && item.details) {
            detailsElement.innerHTML = item.details;
        }
    }

    saveItem() {
        const type = document.getElementById('item-type').value;
        const data = {
            name: document.getElementById('item-name').value.trim(),
            icon: document.getElementById('item-icon').value.trim() || '📁',
            description: document.getElementById('item-description').value.trim() || 'Sin descripción'
        };

        // Para proyectos, agregar el campo details
        if (type === 'project') {
            const detailsElement = document.getElementById('item-details');
            data.details = detailsElement ? detailsElement.innerHTML.trim() : '';
        }

        if (!data.name) {
            alert(`El nombre del ${type} es obligatorio`);
            return;
        }

        if (this.editingItemId) {
            this.updateExistingItem(type, data);
        } else {
            this.createNewItem(type, data);
        }

        this.updateSelectors();
        this.renderItemsList(type);
        this.hideItemForm();
        this.saveData();
    }

    updateExistingItem(type, data) {
        if (type === 'scenario') {
            Object.assign(this.data[this.editingItemId], data);
        } else {
            Object.assign(this.data[this.currentScenario].projects[this.editingItemId], data);
        }
    }

    createNewItem(type, data) {
        let id;
        
        if (type === 'scenario') {
            id = this.scenarioIdCounter++;
            this.data[id] = {
                id,
                ...data,
                projects: {
                    1: { 
                        id: 1, 
                        name: 'Sin proyecto', 
                        icon: '📋', 
                        description: 'Tareas sin categorizar', 
                        tasks: [] 
                    }
                }
            };
        } else {
            id = this.projectIdCounter++;
            this.data[this.currentScenario].projects[id] = { 
                id, 
                ...data, 
                tasks: [] 
            };
        }
    }

    deleteItem(type, itemId) {
        if (!confirm('¿Estás seguro?')) return;
        
        if (type === 'scenario') {
            this.deleteScenario(itemId);
        } else {
            this.deleteProject(itemId);
        }
        
        this.renderItemsList(type);
        this.updateSelectors(); // Actualizar selectores después de eliminar
        this.render(); // Re-renderizar la vista
        this.saveData();
    }

    // === FUNCIONES DE EXPORTAR E IMPORTAR ===
    exportItem(type, itemId) {
        let dataToExport;
        let filename;
        
        if (type === 'scenario') {
            dataToExport = this.data[itemId];
            filename = `escenario_${dataToExport.name}_${new Date().toISOString().split('T')[0]}.json`;
        } else {
            dataToExport = this.data[this.currentScenario].projects[itemId];
            filename = `proyecto_${dataToExport.name}_${new Date().toISOString().split('T')[0]}.json`;
        }
        
        if (!dataToExport) {
            alert('Error: No se pudo encontrar el elemento a exportar');
            return;
        }
        
        // Crear el archivo JSON
        const jsonData = JSON.stringify(dataToExport, null, 2);
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        // Crear enlace de descarga
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log(`📥 ${type} exportado:`, dataToExport);
    }

    importItem(type) {
        const fileInput = document.getElementById('importFileInput');
        fileInput.click();
    }

    handleImportFile(event, type) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                this.processImportedData(importedData, type);
            } catch (error) {
                alert('Error: El archivo no tiene un formato JSON válido');
                console.error('Error al importar:', error);
            }
        };
        reader.readAsText(file);
        
        // Limpiar el input para permitir importar el mismo archivo nuevamente
        event.target.value = '';
    }

    processImportedData(importedData, type) {
        if (!importedData || typeof importedData !== 'object') {
            alert('Error: Formato de datos inválido');
            return;
        }
        
        const timestamp = new Date().toISOString().split('T')[0];
        
        if (type === 'scenario') {
            // Validar estructura de escenario
            if (!importedData.name || !importedData.projects) {
                alert('Error: El archivo no contiene un escenario válido');
                return;
            }
            
            // Generar ID numérico único para escenario
            const newId = this.scenarioIdCounter++;
            
            // Crear nuevo escenario con ID único
            const newScenario = {
                ...importedData,
                id: newId,
                name: `${importedData.name} (importado ${timestamp})`
            };
            
            this.data[newId] = newScenario;
            
        } else {
            // Validar estructura de proyecto
            if (!importedData.name || !importedData.tasks) {
                alert('Error: El archivo no contiene un proyecto válido');
                return;
            }
            
            // Generar ID numérico único para proyecto
            const newId = this.projectIdCounter++;
            
            // Crear nuevo proyecto con ID único
            const newProject = {
                ...importedData,
                id: newId,
                name: `${importedData.name} (importado ${timestamp})`
            };
            
            this.data[this.currentScenario].projects[newId] = newProject;
        }
        
        this.saveData();
        this.renderItemsList(type);
        this.updateSelectors();
        this.render();
        
        alert(`${type === 'scenario' ? 'Escenario' : 'Proyecto'} importado correctamente`);
    }

    deleteScenario(scenarioId) {
        if (scenarioId === 1) return;
        
        // Eliminar completamente el escenario con todos sus proyectos y tareas
        delete this.data[scenarioId];
        
        // Si el escenario eliminado es el actual, cambiar al default
        if (this.currentScenario === scenarioId) {
            this.currentScenario = 1;
            this.currentProject = 1;
        }
    }

    deleteProject(projectId) {
        if (projectId === 1) return;
        
        // Mover tareas a "Sin proyecto"
        const projectToDelete = this.data[this.currentScenario].projects[projectId];
        const noneProject = this.data[this.currentScenario].projects[1];
        
        if (projectToDelete && noneProject) {
            noneProject.tasks.push(...projectToDelete.tasks);
        }
        
        delete this.data[this.currentScenario].projects[projectId];
        
        // Si el proyecto eliminado es el actual, cambiar a "Sin proyecto"
        if (this.currentProject === projectId) {
            this.currentProject = 1;
        }
    }


    // === SELECTORES UNIFICADOS ===
    updateSelectors() {
        this.updateScenarioSelect();
        this.updateProjectSelect();
    }

    updateScenarioSelect() {
        const select = document.getElementById('scenarioSelect');
        select.innerHTML = Object.values(this.data).map(scenario => 
            `<option value="${scenario.id}" ${scenario.id === this.currentScenario ? 'selected' : ''}>${scenario.icon} ${scenario.name}</option>`
        ).join('');
    }

    updateProjectSelect() {
        const select = document.getElementById('projectSelect');
        const projects = this.data[this.currentScenario]?.projects || {};
        select.innerHTML = Object.values(projects).map(project => 
            `<option value="${project.id}" ${project.id === this.currentProject ? 'selected' : ''}>${project.icon} ${project.name}</option>`
        ).join('');
    }

    findParentTask(targetTask) {
        const allTasks = this.getCurrentTasks();
        return this.findParentInTasks(targetTask, allTasks);
    }

    findParentInTasks(targetTask, tasks) {
        for (const task of tasks) {
            if (task.children && task.children.some(child => child.id === targetTask.id)) {
                return task;
            }
            if (task.children) {
                const found = this.findParentInTasks(targetTask, task.children);
                if (found) return found;
            }
        }
        return null;
    }

    // === EDICIÓN DE TAREAS CORREGIDA ===
    showEditTaskModal(taskId) {
        const task = this.findTaskById(taskId);
        if (!task) return;
        
        this.editingTaskId = taskId;
        this.showModal('editTask');
        this.populateEditForm(task);
        
        setTimeout(() => {
            const nameInput = document.getElementById('edit-task-name');
            if (nameInput) nameInput.focus();
        }, 100);
    }

    getEditTaskModalContent() {
        return `
            <form id="editTaskForm">
                <div class="form-row">
                    <input type="text" id="edit-task-name" placeholder="Nombre de la tarea" required />
                    <select id="edit-task-priority">
                        <option value="baja">🟢 Baja</option>
                        <option value="media">🟡 Media</option>
                        <option value="alta">🔴 Alta</option>
                    </select>
                </div>
                <div class="form-row">
                    <div class="markdown-editor">
                        <div class="markdown-toolbar">
                            <button type="button" class="markdown-btn" data-format="bold" title="Negrita (Ctrl+B)"><b>B</b></button>
                            <button type="button" class="markdown-btn" data-format="italic" title="Cursiva (Ctrl+L)"><i>I</i></button>
                            <button type="button" class="markdown-btn" data-format="strikethrough" title="Tachado (Ctrl+Shift+X)"><s>S</s></button>
                            <button type="button" class="markdown-btn" data-format="code" title="Código (Ctrl+Shift+L)">&lt;/&gt;</button>
                            <button type="button" class="markdown-btn" data-format="link" title="Convertir en enlace">🔗</button>
                            <button type="button" class="markdown-btn" data-format="ordered-list" title="Lista numerada (Ctrl+Shift+7)">1.</button>
                            <button type="button" class="markdown-btn" data-format="unordered-list" title="Lista con viñetas (Ctrl+Shift+8)">•</button>
                            <button type="button" class="markdown-btn" data-format="quote" title="Cita (Ctrl+Shift+.)">"</button>
                        </div>
                        <div id="edit-task-description" class="markdown-editor-content" contenteditable="true" data-placeholder="Descripción (opcional)"></div>
                    </div>
                </div>
                <div class="form-row">
                    <input type="datetime-local" id="edit-task-date" />
                    <select id="edit-task-repeat">
                        <option value="">Sin repetir</option>
                        <option value="daily">Diariamente</option>
                        <option value="weekly">Semanalmente</option>
                        <option value="monthly">Mensualmente</option>
                        <option value="yearly">Anualmente</option>
                    </select>
                    <input type="number" id="edit-task-repeat-count" placeholder="Repetir X veces" min="1" max="100" style="display: none;" />
                </div>
                <div class="quick-date-buttons">
                    <button type="button" class="quick-date-btn" data-target="edit-task-date" data-minutes="5">5 min</button>
                    <button type="button" class="quick-date-btn" data-target="edit-task-date" data-minutes="10">10 min</button>
                    <button type="button" class="quick-date-btn" data-target="edit-task-date" data-minutes="30">30 min</button>
                    <button type="button" class="quick-date-btn" data-target="edit-task-date" data-hours="1">1 hora</button>
                    <button type="button" class="quick-date-btn" data-target="edit-task-date" data-hours="2">2 horas</button>
                    <button type="button" class="quick-date-btn" data-target="edit-task-date" data-days="1">Mañana</button>
                    <button type="button" class="quick-date-btn" data-target="edit-task-date" data-days="7">1 semana</button>
                    <button type="button" class="quick-date-btn" data-target="edit-task-date" data-days="30">1 mes</button>
                </div>
                <div class="form-row">
                    <div class="tags-input-container">
                        <input type="text" id="edit-task-tags" placeholder="Escribe etiqueta y presiona Enter..." />
                        <button type="button" class="add-tag-btn">+</button>
                        <div class="tags-suggestions" id="editTagsSuggestions"></div>
                    </div>
                </div>
                <div id="selected-tags-container" class="tags-display"></div>
                <div class="form-row alerts-form-row">
                    <label class="form-label">Alertas</label>
                    <div class="alerts-editor">
                        <div class="alerts-list" id="modalAlertsList"></div>
                        <div class="alert-input-container">
                            <input type="text" class="form-input" id="alertTitleInput" placeholder="Título de la alerta">
                            <input type="text" class="form-input" id="alertMessageInput" placeholder="Mensaje de la alerta">
                            <input type="datetime-local" class="form-input" id="alertDateInput">
                            <div class="quick-alert-buttons">
                                <button type="button" class="quick-alert-btn" data-minutes="60">1h antes</button>
                                <button type="button" class="quick-alert-btn" data-minutes="30">30m antes</button>
                                <button type="button" class="quick-alert-btn" data-minutes="15">15m antes</button>
                                <button type="button" class="quick-alert-btn" data-minutes="10">10m antes</button>
                                <button type="button" class="quick-alert-btn" data-minutes="5">5m antes</button>
                                <button type="button" class="quick-alert-btn" data-minutes="1">1m antes</button>
                            </div>
                            <input type="url" class="form-input" id="alertWebhookInput" placeholder="URL del webhook (opcional)">
                            <button type="button" class="add-item-btn" onclick="taskManager.addAlert()" title="Agregar alerta">+</button>
                        </div>
                        <div class="alert-help-message" style="font-size: 12px; color: #666; margin-top: 8px; padding: 6px 8px; background: #f8f9fa; border-radius: 4px; border-left: 3px solid #007cba;">
                            ⏰ <strong>Importante:</strong> La fecha y hora de la alerta debe ser futura para que funcione correctamente.
                        </div>
                    </div>
                </div>
                <div class="form-buttons">
                    <button type="submit" class="add-btn">Guardar Cambios</button>
                    <button type="button" class="cancel-btn" onclick="taskManager.hideModal()">Cancelar</button>
                </div>
            </form>
        `;
    }

    populateEditForm(task) {
        // Poblar campos básicos
        this.setElementValue('edit-task-name', task.text || '');
        this.setElementValue('edit-task-priority', task.priority || 'media');
        this.setElementValue('edit-task-description', task.description || '');
        // Manejar fecha de vencimiento con hora actual
        let dueDateValue = '';
        if (task.dueDate) {
            const dueDate = new Date(task.dueDate);
            if (!isNaN(dueDate.getTime())) {
                // Si la fecha original no tiene hora específica (es solo fecha), usar hora actual
                if (task.dueDate.includes('T')) {
                    // Ya tiene hora específica, mantenerla
                    dueDateValue = task.dueDate;
                } else {
                    // Solo tiene fecha, agregar hora actual
                    const now = new Date();
                    dueDate.setHours(now.getHours(), now.getMinutes(), 0, 0);
                    const year = dueDate.getFullYear();
                    const month = (dueDate.getMonth() + 1).toString().padStart(2, '0');
                    const day = dueDate.getDate().toString().padStart(2, '0');
                    const hour = dueDate.getHours().toString().padStart(2, '0');
                    const minute = dueDate.getMinutes().toString().padStart(2, '0');
                    dueDateValue = `${year}-${month}-${day}T${hour}:${minute}`;
                }
            }
        }
        this.setElementValue('edit-task-date', dueDateValue);
        this.setElementValue('edit-task-repeat', task.repeat || '');
        
        // Manejar campo de repetición
        const repeatCountInput = document.getElementById('edit-task-repeat-count');
        if (task.repeat) {
            repeatCountInput.style.display = 'block';
            repeatCountInput.value = task.repeatCount || 2;
        } else {
            repeatCountInput.style.display = 'none';
            repeatCountInput.value = '';
        }
        
        // Poblar tags
        this.editingTags = task.tags ? [...task.tags] : [];
        this.setElementValue('edit-task-tags', '');
        
        // Cargar alertas de la tarea
        this.loadTaskAlerts(task.alerts || []);
        this.renderEditingTags();
        
        // Configurar event listeners para sugerencias de etiquetas
        this.setupTagSuggestionListeners();
    }

    // === MANEJO CORREGIDO DE EDICIÓN Y REPETICIÓN ===
    handleEditTaskSubmit() {
        if (!this.editingTaskId) return;
        
        const task = this.findTaskById(this.editingTaskId);
        if (!task) return;
        
        const formData = this.getEditFormData();
        
        // Crear tareas repetidas ANTES de actualizar la original
        let repeatedTasks = [];
        if (formData.repeat && formData.date && formData.repeatCount > 1) {
            // Crear una copia limpia de la tarea original para repetir
            const taskForRepeat = this.createTaskForRepetition(task, formData);
            repeatedTasks = this.createRepeatedTasks(taskForRepeat, formData.repeat, formData.repeatCount);
        }
        
        // Actualizar tarea original y limpiar campos de repetición
        this.updateTaskWithFormData(task, formData);
        // Limpiar datos de repetición de la tarea original
        task.repeat = null;
        task.repeatCount = null;
        
        // Agregar tareas repetidas
        if (repeatedTasks.length > 0) {
            const parent = this.findParentTask(task);
            if (parent) {
                parent.children.push(...repeatedTasks);
            } else {
                this.getCurrentTasks().push(...repeatedTasks);
            }
        }
        
        this.hideModal();
        this.saveAndRender();
    }

    getEditFormData() {
        return {
            name: this.getElementValue('edit-task-name').trim(),
            priority: this.getElementValue('edit-task-priority'),
            description: this.getElementValue('edit-task-description').trim(),
            date: this.getElementValue('edit-task-date'),
            repeat: this.getElementValue('edit-task-repeat'),
            repeatCount: parseInt(this.getElementValue('edit-task-repeat-count')) || 1,
            tags: [...this.editingTags], // Crear nueva copia independiente
            alerts: this.currentTaskAlerts ? [...this.currentTaskAlerts] : [] // Incluir alertas
        };
    }

    updateTaskWithFormData(task, formData) {
        task.text = formData.name;
        task.priority = formData.priority || 'media';
        task.description = formData.description || '';
        task.dueDate = formData.date || null;
        task.tags = [...formData.tags]; // Crear nueva copia independiente
        task.alerts = [...formData.alerts]; // Incluir alertas
        
        // Programar alertas activas
        if (task.alerts && task.alerts.length > 0) {
            task.alerts.forEach(alertObj => {
                if (alertObj.active) {
                    const alertDate = new Date(alertObj.alertDate);
                    const now = new Date();
                    if (alertDate > now) {
                        this.scheduleAlert(alertObj);
                    }
                }
            });
        }
    }

    // === NUEVA FUNCIÓN: CREAR TAREA PARA REPETICIÓN ===
    createTaskForRepetition(originalTask, formData) {
        const newId = this.generateUniqueId();
        return {
            id: newId, // ID único
            text: formData.name,
            completed: false,
            parentId: originalTask.parentId,
            children: this.duplicateChildrenForRepetition(originalTask.children),
            expanded: originalTask.expanded || false,
            depth: originalTask.depth || 0,
            priority: formData.priority || 'media',
            description: formData.description || '',
            dueDate: formData.date || null,
            repeat: formData.repeat,
            repeatCount: formData.repeatCount,
            tags: [...formData.tags] // Crear nueva copia independiente
        };
    }

    // === DUPLICACIÓN CORREGIDA DE HIJOS ===
    duplicateChildrenForRepetition(children) {
        return children.map(child => {
            const childId = this.generateUniqueId();
            return {
                id: childId, // ID único para cada hijo
                text: child.text,
                completed: false,
                parentId: null, // Se ajustará después
                children: this.duplicateChildrenForRepetition(child.children),
                expanded: child.expanded || false,
                depth: child.depth || 0,
                priority: child.priority || 'media',
                description: child.description || '',
                dueDate: child.dueDate || null,
                repeat: null, // Las repeticiones no se propagan a hijos
                repeatCount: null,
                tags: child.tags ? [...child.tags] : [] // Crear nueva copia independiente
            };
        });
    }

    // === GESTIÓN DE ETIQUETAS SIMPLIFICADA ===
    addTagFromInput() {
        const input = document.getElementById('edit-task-tags');
        if (!input) return;
        
        const tagText = input.value.trim();
        if (tagText && !this.editingTags.some(tag => (typeof tag === 'string' ? tag : tag.text) === tagText)) {
            const tagObj = {
                id: this.tagIdCounter++,
                text: tagText
            };
            this.editingTags.push(tagObj);
            input.value = '';
            this.renderEditingTags();
            
            // Ocultar sugerencias
            const suggestions = document.getElementById('editTagsSuggestions');
            if (suggestions) suggestions.classList.remove('show');
        }
    }

    renderEditingTags() {
        const container = document.getElementById('selected-tags-container');
        if (!container) return;
        
        container.innerHTML = this.editingTags.map(tag => {
            const tagText = typeof tag === 'string' ? tag : tag.text;
            const tagId = typeof tag === 'string' ? tag : tag.id;
            return `
                <div class="tag-item">
                    ${tagText}
                    <button class="remove-tag" data-tag="${tagText}" data-tag-id="${tagId}">&times;</button>
                </div>
            `;
        }).join('');
    }

    removeEditingTag(tag) {
        this.editingTags = this.editingTags.filter(t => (typeof t === 'string' ? t : t.text) !== tag);
        this.renderEditingTags();
    }

    // === SUGERENCIAS DE ETIQUETAS ===
    getAllExistingTags() {
        const tags = new Set();
        const allTasks = this.getAllTasks();
        allTasks.forEach(task => {
            if (task.tags) {
                task.tags.forEach(tag => {
                    const tagText = typeof tag === 'string' ? tag : tag.text;
                    tags.add(tagText);
                });
            }
        });
        return Array.from(tags).sort();
    }

    showTagSuggestions() {
        const input = document.getElementById('edit-task-tags');
        const suggestionsElement = document.getElementById('editTagsSuggestions');
        
        if (!input || !suggestionsElement) return;
        
        const query = input.value.toLowerCase();
        const existingTags = this.getAllExistingTags();
        
        if (query.length === 0) {
            suggestionsElement.classList.remove('show');
            return;
        }
        
        const filteredTags = existingTags.filter(tag => 
            tag.toLowerCase().includes(query) && 
            !this.editingTags.includes(tag)
        );
        
        if (filteredTags.length === 0) {
            suggestionsElement.classList.remove('show');
            return;
        }
        
        suggestionsElement.innerHTML = '';
        filteredTags.forEach(tag => {
            const suggestionDiv = document.createElement('div');
            suggestionDiv.className = 'suggestion-item';
            suggestionDiv.textContent = tag;
            
            suggestionDiv.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.selectTagSuggestion(tag);
            });
            
            suggestionsElement.appendChild(suggestionDiv);
        });
        
        suggestionsElement.classList.add('show');
    }

    selectTagSuggestion(tag) {
        if (!this.editingTags.includes(tag)) {
            this.editingTags.push(tag);
            this.renderEditingTags();
        }
        
        const input = document.getElementById('edit-task-tags');
        const suggestions = document.getElementById('editTagsSuggestions');
        if (input) input.value = '';
        if (suggestions) suggestions.classList.remove('show');
    }

    hideTagSuggestions() {
        const suggestionsElement = document.getElementById('editTagsSuggestions');
        if (!suggestionsElement) return;
        
        setTimeout(() => {
            suggestionsElement.classList.remove('show');
        }, 200);
    }

    setupTagSuggestionListeners() {
        const input = document.getElementById('edit-task-tags');
        if (!input) return;
        
        // Remover listeners existentes para evitar duplicados
        input.onkeypress = null;
        input.oninput = null;
        input.onblur = null;
        
        // Agregar nuevos listeners
        input.addEventListener('input', () => {
            this.showTagSuggestions();
        });
        
        input.addEventListener('blur', () => {
            this.hideTagSuggestions();
        });
        
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const suggestions = document.getElementById('editTagsSuggestions');
                if (suggestions) suggestions.classList.remove('show');
            }
        });
    }

    // === FECHAS RÁPIDAS ===
    setQuickDate(button) {
        const target = button.dataset.target;
        const dateInput = document.getElementById(target);
        
        if (!dateInput) return;
        
        const date = new Date();
        
        // Manejar diferentes tipos de tiempo
        if (button.dataset.minutes) {
            const minutes = parseInt(button.dataset.minutes);
            date.setMinutes(date.getMinutes() + minutes);
        } else if (button.dataset.hours) {
            const hours = parseInt(button.dataset.hours);
            date.setHours(date.getHours() + hours);
        } else if (button.dataset.days) {
            const days = parseInt(button.dataset.days);
            date.setDate(date.getDate() + days);
            // Para días, establecer una hora fija (9:00 AM)
            date.setHours(9, 0, 0, 0);
        }
        
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const hour = date.getHours().toString().padStart(2, '0');
        const minute = date.getMinutes().toString().padStart(2, '0');
        
        dateInput.value = `${year}-${month}-${day}T${hour}:${minute}`;
    }

    // === ALERTAS RÁPIDAS ===
    setQuickAlert(button) {
        const minutes = parseInt(button.dataset.minutes);
        
        // Obtener la fecha de vencimiento de la tarea actual
        const dueDateInput = document.getElementById('edit-task-date');
        if (!dueDateInput || !dueDateInput.value) {
            alert('❌ Primero debes establecer una fecha de vencimiento para la tarea');
            return;
        }
        
        // Calcular la fecha de la alerta (X minutos antes de la fecha de vencimiento)
        const dueDate = new Date(dueDateInput.value);
        const alertDate = new Date(dueDate.getTime() - (minutes * 60 * 1000));
        
        // Verificar que la fecha de alerta sea futura
        const now = new Date();
        if (alertDate <= now) {
            alert('❌ La fecha de alerta debe ser en el futuro. Ajusta la fecha de vencimiento de la tarea.');
            return;
        }
        
        // Rellenar los campos de alerta
        const titleInput = document.getElementById('alertTitleInput');
        const messageInput = document.getElementById('alertMessageInput');
        const dateInput = document.getElementById('alertDateInput');
        
        // Auto-rellenar título con el nombre de la tarea
        const taskTitleInput = document.getElementById('edit-task-name');
        const taskTitle = taskTitleInput ? taskTitleInput.value : 'Tarea';
        titleInput.value = `Recordatorio: ${taskTitle}`;
        
        // Auto-rellenar mensaje con el tiempo restante
        let timeText;
        if (minutes >= 60) {
            const hours = Math.floor(minutes / 60);
            timeText = hours === 1 ? '1 hora' : `${hours} horas`;
        } else {
            timeText = minutes === 1 ? '1 minuto' : `${minutes} minutos`;
        }
        messageInput.value = `Faltan ${timeText} para la fecha de vencimiento`;
        
        // Establecer la fecha de la alerta
        const year = alertDate.getFullYear();
        const month = (alertDate.getMonth() + 1).toString().padStart(2, '0');
        const day = alertDate.getDate().toString().padStart(2, '0');
        const hour = alertDate.getHours().toString().padStart(2, '0');
        const minute = alertDate.getMinutes().toString().padStart(2, '0');
        
        dateInput.value = `${year}-${month}-${day}T${hour}:${minute}`;
    }

    // === CÁLCULOS DE TIEMPO ===
    getDaysRemainingBadge(daysRemaining, dueDate = null) {
        if (daysRemaining === null) return null;
        
        let text, className;
        
        if (daysRemaining < 0) {
            text = `Vencido ${Math.abs(daysRemaining)} día${Math.abs(daysRemaining) > 1 ? 's' : ''}`;
            className = 'days-remaining-overdue';
        } else if (daysRemaining === 0) {
            // Para "Hoy", SIEMPRE calcular y mostrar tiempo restante
            if (dueDate) {
                const now = new Date();
                const taskDateTime = new Date(dueDate);
                
                if (taskDateTime > now) {
                    const timeDiff = taskDateTime.getTime() - now.getTime();
                    const hours = Math.floor(timeDiff / (1000 * 60 * 60));
                    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
                    
                    if (hours > 0) {
                        text = `Hoy (${hours}h ${minutes}m)`;
                    } else if (minutes > 0) {
                        text = `Hoy (${minutes}m)`;
                    } else {
                        text = 'Hoy (<1m)';
                    }
                } else {
                    text = 'Hoy (vencido)';
                }
            } else {
                text = 'Hoy';
            }
            className = 'days-remaining-today';
        } else if (daysRemaining === 1) {
            text = 'Mañana';
            className = 'days-remaining-soon';
        } else if (daysRemaining <= 7) {
            text = `${daysRemaining} días`;
            className = 'days-remaining-soon';
        } else {
            text = `${daysRemaining} días`;
            className = 'days-remaining-future';
        }
        
        return { text, className };
    }

    getTimeRemainingInfo(dueDate) {
        if (!dueDate) return null;
        
        const now = new Date();
        const taskDateTime = new Date(dueDate);
        const todayStr = now.toISOString().split('T')[0];
        const taskDateStr = dueDate.split('T')[0];
        
        if (taskDateStr === todayStr && taskDateTime > now) {
            const timeDiff = taskDateTime.getTime() - now.getTime();
            const hours = Math.floor(timeDiff / (1000 * 60 * 60));
            const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
            
            let timeText = '';
            let className = '';
            
            if (hours > 0) {
                timeText = `${hours}h ${minutes}m restantes`;
                className = hours >= 2 ? 'time-remaining-safe' : 'time-remaining-soon';
            } else if (minutes > 0) {
                timeText = `${minutes}m restantes`;
                className = minutes >= 30 ? 'time-remaining-soon' : 'time-remaining-urgent';
            } else {
                timeText = 'Menos de 1m';
                className = 'time-remaining-urgent';
            }
            
            return { text: timeText, class: className };
        }
        
        return null;
    }

    calculateDaysRemaining(dueDate) {
        if (!dueDate) return null;
        
        const now = new Date();
        const taskDateTime = new Date(dueDate); // Usar fecha y hora completa
        
        // Comparar solo las fechas (día/mes/año) ignorando la hora
        const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const taskDateOnly = new Date(taskDateTime.getFullYear(), taskDateTime.getMonth(), taskDateTime.getDate());
        
        // Calcular diferencia en días
        const timeDiff = taskDateOnly.getTime() - nowDateOnly.getTime();
        const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
        
        return daysDiff;
    }

    getDueDateInfo(dueDate) {
        if (!dueDate) return null;
        
        const now = new Date();
        const taskDateTime = new Date(dueDate);
        
        const dateStr = taskDateTime.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
        const timeStr = taskDateTime.toLocaleTimeString('es-ES', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        const fullDateTime = `${dateStr} ${timeStr}`;
        
        if (taskDateTime <= now) {
            return { 
                text: fullDateTime, 
                class: 'due-overdue',
                isOverdue: true 
            };
        } else {
            return { 
                text: fullDateTime, 
                class: 'due-future',
                isOverdue: false 
            };
        }
    }

    // === REPETICIÓN DE TAREAS CORREGIDA ===
    createRepeatedTasks(originalTask, repeatType, repeatCount) {
        const createdTasks = [];
        const baseDate = new Date(originalTask.dueDate);
        
        for (let i = 1; i < repeatCount; i++) {
            const newDate = new Date(baseDate);
            
            switch (repeatType) {
                case 'daily':
                    newDate.setDate(baseDate.getDate() + i);
                    break;
                case 'weekly':
                    newDate.setDate(baseDate.getDate() + (i * 7));
                    break;
                case 'monthly':
                    newDate.setMonth(baseDate.getMonth() + i);
                    break;
                case 'yearly':
                    newDate.setFullYear(baseDate.getFullYear() + i);
                    break;
                default:
                    continue;
            }
            
            const taskId = this.generateUniqueId();
            const repeatedTask = {
                id: taskId, // ID único
                text: `${originalTask.text} (${i + 1}/${repeatCount})`,
                dueDate: newDate.toISOString().slice(0, 16),
                completed: false,
                expanded: originalTask.expanded || false,
                depth: originalTask.depth || 0,
                parentId: originalTask.parentId || null,
                priority: originalTask.priority || 'media',
                description: originalTask.description || '',
                repeat: null, // Las repeticiones no se propagan
                repeatCount: null,
                tags: originalTask.tags ? [...originalTask.tags] : [], // Crear nueva copia independiente
                isRepeated: true,
                originalTaskId: originalTask.id,
                repeatSequence: i + 1,
                children: this.duplicateChildrenForRepetition(originalTask.children || [])
            };
            
            // Ajustar parentId de los hijos
            this.adjustChildrenParentIds(repeatedTask.children, repeatedTask.id);
            
            createdTasks.push(repeatedTask);
        }
        
        return createdTasks;
    }

    // === NUEVA FUNCIÓN: AJUSTAR PARENT IDS ===
    adjustChildrenParentIds(children, newParentId) {
        children.forEach(child => {
            child.parentId = newParentId;
            if (child.children && child.children.length > 0) {
                this.adjustChildrenParentIds(child.children, child.id);
            }
        });
    }

    // === PERSISTENCIA ===
    saveData() {
        try {
            const saveData = {
                data: this.data,
                taskIdCounter: this.taskIdCounter,
                scenarioIdCounter: this.scenarioIdCounter,
                projectIdCounter: this.projectIdCounter,
                tagIdCounter: this.tagIdCounter,
                alertIdCounter: this.alertIdCounter,
                currentScenario: this.currentScenario,
                currentProject: this.currentProject,
                allTasksCollapsed: this.allTasksCollapsed
            };
            localStorage.setItem('taskTreeData', JSON.stringify(saveData));
        } catch (error) {
            console.error('Error al guardar datos:', error);
        }
    }

    loadData() {
        try {
            const savedData = localStorage.getItem('taskTreeData');
            
            if (savedData) {
                const loadedData = JSON.parse(savedData);
                this.data = loadedData.data || this.data;
                this.taskIdCounter = loadedData.taskIdCounter || 1;
                this.scenarioIdCounter = loadedData.scenarioIdCounter || 2;
                this.projectIdCounter = loadedData.projectIdCounter || 2;
                this.tagIdCounter = loadedData.tagIdCounter || 1;
                this.alertIdCounter = loadedData.alertIdCounter || 1;
                this.currentScenario = loadedData.currentScenario || 1;
                this.currentProject = loadedData.currentProject || 1;
                this.allTasksCollapsed = loadedData.allTasksCollapsed || false;
                
                // Reprogramar todas las alertas después de cargar los datos
                this.rescheduleAllAlerts();
            }
        } catch (error) {
            console.error('Error al cargar datos:', error);
        }
    }

    // === REPROGRAMAR ALERTAS ===
    rescheduleAllAlerts() {
        console.log('🔄 Reprogramando todas las alertas después de cargar datos...');
        
        // Limpiar timeouts e intervalos existentes
        if (this.alertTimeouts) {
            Object.values(this.alertTimeouts).forEach(timeout => clearTimeout(timeout));
            this.alertTimeouts = {};
        }
        
        if (this.countdownIntervals) {
            Object.values(this.countdownIntervals).forEach(interval => clearInterval(interval));
            this.countdownIntervals = {};
        }
        
        // Recorrer todos los escenarios y proyectos
        Object.values(this.data).forEach(scenario => {
            if (scenario.projects) {
                Object.values(scenario.projects).forEach(project => {
                    if (project.tasks) {
                        this.rescheduleTaskAlerts(project.tasks);
                    }
                });
            }
        });
        
        console.log('✅ Todas las alertas han sido reprogramadas');
    }
    
    rescheduleTaskAlerts(tasks) {
        tasks.forEach(task => {
            // Reprogramar alertas de esta tarea
            if (task.alerts && task.alerts.length > 0) {
                task.alerts.forEach(alertObj => {
                    if (alertObj.active) {
                        const alertDate = new Date(alertObj.alertDate);
                        const now = new Date();
                        if (alertDate > now) {
                            console.log(`⏰ Reprogramando alerta: "${alertObj.title}" para ${alertDate.toLocaleString()}`);
                            this.scheduleAlert(alertObj);
                        } else {
                            console.log(`⚠️ Alerta vencida omitida: "${alertObj.title}"`);
                        }
                    }
                });
            }
            
            // Reprogramar alertas de subtareas recursivamente
            if (task.children && task.children.length > 0) {
                this.rescheduleTaskAlerts(task.children);
            }
        });
    }

    // === FILTROS ===
    applyFilter(filterType) {
        this.currentFilter = filterType;
        
        // Actualizar solo botones de filtro de vista (no los de ordenamiento)
        document.querySelectorAll('[data-filter]').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-filter="${filterType}"]`).classList.add('active');
        
        // Mostrar u ocultar el botón de expandir/contraer según el filtro
        this.updateExpandCollapseControlVisibility();
        
        this.render();
    }

    toggleSort(sortType) {
        // Toggle del filtro de ordenamiento
        if (this.activeSortingFilters.has(sortType)) {
            this.activeSortingFilters.delete(sortType);
            document.querySelector(`[data-sort="${sortType}"]`).classList.remove('active');
        } else {
            this.activeSortingFilters.add(sortType);
            document.querySelector(`[data-sort="${sortType}"]`).classList.add('active');
        }
        
        this.render();
    }

    // === FUNCIONALIDAD DE EXPANDIR/CONTRAER TODAS LAS TAREAS ===
    toggleAllTasks() {
        this.allTasksCollapsed = !this.allTasksCollapsed;
        
        // Obtener todas las tareas que tienen hijos
        const tasksWithChildren = this.getAllTasksWithChildren();
        
        // Contraer o expandir todas las tareas
        tasksWithChildren.forEach(task => {
            task.expanded = !this.allTasksCollapsed;
        });
        
        // Actualizar texto del botón
        this.updateExpandCollapseButtonText();
        
        // Re-renderizar
        this.saveAndRender();
    }

    getAllTasksWithChildren() {
        const allTasks = this.getAllTasks();
        return allTasks.filter(task => task.children && task.children.length > 0);
    }

    updateExpandCollapseControlVisibility() {
        const expandCollapseControl = document.getElementById('expandCollapseControl');
        
        if (this.currentFilter === 'all') {
            // Solo mostrar si hay tareas con hijos
            const tasksWithChildren = this.getAllTasksWithChildren();
            if (tasksWithChildren.length > 0) {
                expandCollapseControl.style.display = 'block';
                this.updateExpandCollapseButtonText();
            } else {
                expandCollapseControl.style.display = 'none';
            }
        } else {
            expandCollapseControl.style.display = 'none';
        }
    }

    updateExpandCollapseButtonText() {
        const btn = document.getElementById('expandCollapseBtn');
        if (!btn) return;
        
        // Detectar el estado real basado en las tareas actuales
        const actualState = this.detectActualCollapseState();
        
        if (actualState) {
            btn.innerHTML = '<span>▶ Expandir todas</span>';
        } else {
            btn.innerHTML = '<span>▼ Contraer todas</span>';
        }
        
        // Sincronizar el estado interno con el real
        this.allTasksCollapsed = actualState;
    }

    detectActualCollapseState() {
        const tasksWithChildren = this.getAllTasksWithChildren();
        if (tasksWithChildren.length === 0) return false;
        
        // Si todas las tareas con hijos están contraídas, retorna true
        const allCollapsed = tasksWithChildren.every(task => !task.expanded);
        return allCollapsed;
    }

    // === FUNCIONALIDAD DE SELECCIÓN MÚLTIPLE ===
    toggleTaskSelection(taskId) {
        if (this.selectedTasks.has(taskId)) {
            this.selectedTasks.delete(taskId);
        } else {
            this.selectedTasks.add(taskId);
            this.lastSelectedTaskId = taskId;
        }
        this.updateMultiSelectUI();
    }

    selectTaskRange(startTaskId, endTaskId) {
        // Obtener todas las tareas visibles en orden
        const visibleTasks = this.getVisibleTasksInOrder();
        const startIndex = visibleTasks.findIndex(task => task.id === startTaskId);
        const endIndex = visibleTasks.findIndex(task => task.id === endTaskId);
        
        if (startIndex === -1 || endIndex === -1) return;
        
        const minIndex = Math.min(startIndex, endIndex);
        const maxIndex = Math.max(startIndex, endIndex);
        
        // Seleccionar todas las tareas en el rango
        for (let i = minIndex; i <= maxIndex; i++) {
            this.selectedTasks.add(visibleTasks[i].id);
        }
        
        this.lastSelectedTaskId = endTaskId;
        this.updateMultiSelectUI();
    }

    getVisibleTasksInOrder() {
        if (this.currentFilter === 'all') {
            return this.getAllTasks();
        } else {
            return this.getFilteredTasks();
        }
    }

    clearSelection() {
        this.selectedTasks.clear();
        this.lastSelectedTaskId = null;
        this.updateMultiSelectUI();
    }

    updateMultiSelectUI() {
        const multiSelectBar = document.getElementById('multiSelectBar');
        const selectedCount = document.getElementById('selectedCount');
        
        if (this.selectedTasks.size > 0) {
            multiSelectBar.style.display = 'flex';
            selectedCount.textContent = this.selectedTasks.size;
        } else {
            multiSelectBar.style.display = 'none';
        }
        
        // Actualizar clases CSS de las tareas
        this.updateTaskSelectionStyles();
    }

    updateTaskSelectionStyles() {
        document.querySelectorAll('.task-item').forEach(taskItem => {
            const taskId = parseInt(taskItem.dataset.taskId);
            if (this.selectedTasks.has(taskId)) {
                taskItem.classList.add('selected');
            } else {
                taskItem.classList.remove('selected');
            }
        });
    }

    // === ACCIONES EN LOTE ===
    bulkComplete() {
        if (this.selectedTasks.size === 0) return;
        
        const selectedTaskIds = Array.from(this.selectedTasks);
        selectedTaskIds.forEach(taskId => {
            const task = this.findTaskById(taskId);
            if (task && !task.completed) {
                task.completed = true;
                this.updateChildrenCompletion(task, true);
            }
        });
        
        this.clearSelection();
        this.saveAndRender();
    }

    bulkDuplicate() {
        if (this.selectedTasks.size === 0) return;
        
        const selectedTaskIds = Array.from(this.selectedTasks);
        const tasksToProcess = selectedTaskIds.map(id => this.findTaskById(id)).filter(task => task);
        
        // Procesar en orden inverso para mantener el orden correcto
        tasksToProcess.reverse().forEach(originalTask => {
            const duplicatedTask = this.createTaskCopy(originalTask);
            
            // Insertar la tarea duplicada justo después de la original
            if (originalTask.parentId) {
                const parent = this.findTaskById(originalTask.parentId);
                if (parent) {
                    const index = parent.children.findIndex(child => child.id === originalTask.id);
                    parent.children.splice(index + 1, 0, duplicatedTask);
                }
            } else {
                const currentTasks = this.getCurrentTasks();
                const index = currentTasks.findIndex(task => task.id === originalTask.id);
                currentTasks.splice(index + 1, 0, duplicatedTask);
            }
        });
        
        this.clearSelection();
        this.saveAndRender();
    }

    bulkDelete() {
        if (this.selectedTasks.size === 0) return;
        
        const count = this.selectedTasks.size;
        if (!confirm(`¿Estás seguro de que quieres eliminar ${count} tarea${count > 1 ? 's' : ''} seleccionada${count > 1 ? 's' : ''}?`)) {
            return;
        }
        
        const selectedTaskIds = Array.from(this.selectedTasks);
        selectedTaskIds.forEach(taskId => {
            this.removeTaskById(taskId);
        });
        
        this.clearSelection();
        this.saveAndRender();
    }

    // === EDICIÓN INLINE ===
    startInlineEdit(taskId) {
        // Si ya hay una tarea siendo editada, terminar esa edición primero
        if (this.currentlyEditingTaskId) {
            this.endInlineEdit(false);
        }
        
        const task = this.findTaskById(taskId);
        if (!task) return;
        
        this.currentlyEditingTaskId = taskId;
        
        const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
        if (!taskElement) return;
        
        const taskText = taskElement.querySelector('.task-text');
        if (!taskText) return;
        
        // Crear input de edición
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'inline-edit-input';
        input.value = task.text;
        input.dataset.originalText = task.text;
        
        // Reemplazar el texto con el input
        taskText.style.display = 'none';
        taskText.classList.add('editing');
        this.safeInsertBefore(taskText.parentNode, input, taskText.nextSibling);
        
        // Seleccionar todo el texto y enfocar
        input.focus();
        input.select();
        
        // Agregar event listeners
        input.addEventListener('blur', () => this.endInlineEdit(true));
        input.addEventListener('keydown', (e) => this.handleInlineEditKeydown(e));
    }
    
    handleInlineEditKeydown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.endInlineEdit(true);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            this.endInlineEdit(false);
        }
    }
    
    endInlineEdit(save) {
        if (!this.currentlyEditingTaskId) return;
        
        const taskElement = document.querySelector(`[data-task-id="${this.currentlyEditingTaskId}"]`);
        if (!taskElement) {
            this.currentlyEditingTaskId = null;
            return;
        }
        
        const input = taskElement.querySelector('.inline-edit-input');
        const taskText = taskElement.querySelector('.task-text');
        
        if (!input || !taskText) {
            this.currentlyEditingTaskId = null;
            return;
        }
        
        if (save) {
            const newText = input.value.trim();
            if (newText && newText !== input.dataset.originalText) {
                const task = this.findTaskById(this.currentlyEditingTaskId);
                if (task) {
                    task.text = newText;
                    this.saveData();
                }
            } else if (!newText) {
                // Si el texto está vacío, restaurar el texto original
                input.value = input.dataset.originalText;
            }
        }
        
        // Limpiar la edición
        input.remove();
        taskText.style.display = '';
        taskText.classList.remove('editing');
        this.currentlyEditingTaskId = null;
        
        // Re-renderizar solo si se guardó un cambio
        if (save && input.value.trim() && input.value.trim() !== input.dataset.originalText) {
            this.render();
        }
    }

    toggleTagFilter(tag) {
        if (this.activeTagFilters.has(tag)) {
            this.activeTagFilters.delete(tag);
        } else {
            this.activeTagFilters.add(tag);
        }
        
        // Actualizar visibilidad del tag
        const tagElement = document.querySelector(`[data-tag="${tag}"]`);
        if (tagElement) {
            tagElement.classList.toggle('active', this.activeTagFilters.has(tag));
        }
        
        this.render();
    }

    updateFilterTags() {
        const filterTagsContainer = document.getElementById('filterTags');
        if (!filterTagsContainer) return;

        // Obtener todas las etiquetas únicas
        const allTags = new Set();
        this.getAllTasks().forEach(task => {
            if (task.tags) {
                task.tags.forEach(tag => allTags.add(tag));
            }
        });

        if (allTags.size === 0) {
            filterTagsContainer.innerHTML = '<span class="no-tags-message">No hay etiquetas disponibles</span>';
            return;
        }

        filterTagsContainer.innerHTML = Array.from(allTags).map(tag => 
            `<span class="filter-tag ${this.activeTagFilters.has(tag) ? 'active' : ''}" 
                   data-tag="${tag}" 
                   onclick="taskManager.toggleTagFilter('${tag}')">${tag}</span>`
        ).join('');
    }

    getFilteredTasks() {
        let tasks = this.getAllTasks();
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Filtro por vista
        switch (this.currentFilter) {
            case 'all':
                // No filtrar, mostrar todas las tareas
                break;
            case 'today':
                tasks = tasks.filter(task => {
                    if (task.completed) return false;
                    if (!task.dueDate) return false;
                    const taskDate = new Date(task.dueDate);
                    taskDate.setHours(0, 0, 0, 0);
                    return taskDate.getTime() <= today.getTime();
                });
                break;
            case 'tomorrow':
                tasks = tasks.filter(task => {
                    if (task.completed) return false;
                    if (!task.dueDate) return false;
                    const taskDate = new Date(task.dueDate);
                    taskDate.setHours(0, 0, 0, 0);
                    return taskDate.getTime() === tomorrow.getTime();
                });
                break;
            case 'overdue':
                tasks = tasks.filter(task => {
                    if (task.completed) return false;
                    if (!task.dueDate) return false;
                    const taskDateTime = new Date(task.dueDate);
                    const now = new Date();
                    return taskDateTime.getTime() < now.getTime();
                });
                break;
            case 'pending':
                tasks = tasks.filter(task => !task.completed);
                break;
            case 'completed':
                tasks = tasks.filter(task => task.completed);
                break;
        }

        // Filtro por etiquetas
        if (this.activeTagFilters.size > 0) {
            tasks = tasks.filter(task => {
                if (!task.tags) return false;
                return Array.from(this.activeTagFilters).some(tag => task.tags.includes(tag));
            });
        }

        // Aplicar ordenamiento
        if (this.activeSortingFilters.size > 0) {
            tasks = this.sortTasks(tasks, this.activeSortingFilters);
        }

        return tasks;
    }

    sortTasks(tasks, sortingFilters) {
        return tasks.sort((a, b) => {
            const sortArray = Array.from(sortingFilters);
            
            // Si hay ambos filtros, crear un sistema de puntuación de urgencia
            if (sortArray.includes('dueDate') && sortArray.includes('priority')) {
                // Calcular puntuación de urgencia para cada tarea
                const getUrgencyScore = (task) => {
                    let score = 0;
                    
                    // Puntuación por prioridad (más puntos = más urgente)
                    const priorityScores = { 'alta': 100, 'media': 50, 'baja': 10 };
                    score += priorityScores[task.priority || 'media'];
                    
                    // Puntuación por fecha (más puntos = más urgente/cercana)
                    if (task.dueDate) {
                        const taskDate = new Date(task.dueDate);
                        const now = new Date();
                        const diffHours = (taskDate - now) / (1000 * 60 * 60); // Diferencia en horas
                        
                        if (diffHours < 0) {
                            // Tarea vencida = muy urgente
                            score += 1000 + Math.abs(diffHours);
                        } else if (diffHours <= 24) {
                            // Próximas 24 horas = muy urgente
                            score += 500 + (24 - diffHours) * 10;
                        } else if (diffHours <= 168) {
                            // Próxima semana = urgente
                            score += 200 + (168 - diffHours);
                        } else {
                            // Más lejanas = menos urgentes
                            score += Math.max(0, 100 - diffHours / 24);
                        }
                    } else {
                        // Sin fecha = menos urgente
                        score += 5;
                    }
                    
                    return score;
                };
                
                const urgencyA = getUrgencyScore(a);
                const urgencyB = getUrgencyScore(b);
                const urgencyDiff = urgencyB - urgencyA; // Mayor urgencia primero
                
                return urgencyDiff !== 0 ? urgencyDiff : a.text.localeCompare(b.text);
            }
            
            // Solo por fecha
            if (sortArray.includes('dueDate')) {
                if (!a.dueDate && !b.dueDate) {
                    return a.text.localeCompare(b.text);
                }
                if (!a.dueDate) return 1;
                if (!b.dueDate) return -1;
                
                const dateA = new Date(a.dueDate);
                const dateB = new Date(b.dueDate);
                const dateDiff = dateA - dateB;
                return dateDiff !== 0 ? dateDiff : a.text.localeCompare(b.text);
            }
            
            // Solo por prioridad
            if (sortArray.includes('priority')) {
                const priorityOrder = { 'alta': 0, 'media': 1, 'baja': 2 };
                const priorityA = priorityOrder[a.priority || 'media'];
                const priorityB = priorityOrder[b.priority || 'media'];
                const priorityDiff = priorityA - priorityB;
                return priorityDiff !== 0 ? priorityDiff : a.text.localeCompare(b.text);
            }
            
            return 0;
        });
    }

    // === UTILIDADES ===
    saveAndRender() {
        this.saveData();
        this.render();
    }

    escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // === UTILIDADES DE DOM SIMPLIFICADAS ===
    getElementValue(id) {
        const element = document.getElementById(id);
        if (!element) return '';
        
        // Para elementos contenteditable, usar innerHTML
        if (element.contentEditable === 'true') {
            return element.innerHTML;
        }
        
        return element.value || '';
    }

    setElementValue(id, value) {
        const element = document.getElementById(id);
        if (!element) return;
        
        // Para elementos contenteditable, usar innerHTML
        if (element.contentEditable === 'true') {
            element.innerHTML = value || '';
            // Convertir URLs después de establecer el contenido
            if (value && element.classList.contains('markdown-editor-content')) {
                setTimeout(() => {
                    this.convertUrlsToLinks(element);
                }, 50);
            }
        } else {
            element.value = value;
        }
    }

    // === GESTIÓN DE ALERTAS ===
    addAlert() {
        const titleInput = document.getElementById('alertTitleInput');
        const messageInput = document.getElementById('alertMessageInput');
        const dateInput = document.getElementById('alertDateInput');
        const webhookInput = document.getElementById('alertWebhookInput');
        
        const title = titleInput.value.trim();
        const message = messageInput.value.trim();
        const alertDate = dateInput.value;
        const webhookUrl = webhookInput.value.trim();
        
        if (!title || !message || !alertDate) {
            alert('❌ Título, mensaje y fecha son requeridos para la alerta');
            return;
        }
        
        // Verificar que la fecha sea en el futuro
        const alertDateTime = new Date(alertDate);
        const now = new Date();
        if (alertDateTime <= now) {
            alert('❌ La fecha de la alerta debe ser en el futuro');
            return;
        }
        
        const alertId = this.alertIdCounter++; // Usar contador para ID único
        const alertObj = {
            id: alertId,
            title: title,
            message: message,
            alertDate: alertDate,
            webhookUrl: webhookUrl || null,
            active: true,
            created: new Date().toISOString()
        };
        
        // Inicializar array de alertas si no existe
        if (!this.currentTaskAlerts) {
            this.currentTaskAlerts = [];
        }
        
        // Agregar alerta al array temporal
        this.currentTaskAlerts.push(alertObj);
        
        // Agregar alerta a la lista del modal
        this.addAlertToList(alertObj);
        
        // Limpiar inputs
        titleInput.value = '';
        messageInput.value = '';
        dateInput.value = '';
        webhookInput.value = '';
        
        // Programar la alerta
        this.scheduleAlert(alertObj);
        
        alert(`✅ Alerta "${title}" programada para ${new Date(alertDate).toLocaleString()}`);
    }

    addAlertToList(alertObj) {
        const alertsList = document.getElementById('modalAlertsList');
        if (!alertsList) return;
        
        const alertElement = document.createElement('div');
        alertElement.className = `alert-item ${alertObj.active ? 'alert-active' : 'alert-inactive'}`;
        alertElement.setAttribute('data-alert-id', alertObj.id);
        
        const alertDate = new Date(alertObj.alertDate);
        const timeRemaining = this.getTimeRemaining(alertDate);
        
        // Mostrar parte del URL si existe
        let urlDisplay = '';
        if (alertObj.webhookUrl) {
            try {
                const url = new URL(alertObj.webhookUrl);
                const domain = url.hostname;
                const path = url.pathname.length > 20 ? url.pathname.substring(0, 20) + '...' : url.pathname;
                urlDisplay = `<div class="alert-webhook">🔗 ${domain}${path}</div>`;
            } catch (e) {
                // Si no es una URL válida, mostrar los primeros caracteres
                const shortUrl = alertObj.webhookUrl.length > 30 ? alertObj.webhookUrl.substring(0, 30) + '...' : alertObj.webhookUrl;
                urlDisplay = `<div class="alert-webhook">🔗 ${shortUrl}</div>`;
            }
        }
        
        alertElement.innerHTML = `
            <div class="alert-content">
                <div class="alert-header">
                    <strong>${alertObj.title}</strong>
                    <div class="alert-actions">
                        <button class="alert-action-btn edit-alert-btn" onclick="taskManager.editAlert(${alertObj.id})" title="Editar fecha">✏️</button>
                        <button class="alert-action-btn toggle-alert-btn" onclick="taskManager.toggleAlert(${alertObj.id})" title="${alertObj.active ? 'Desactivar' : 'Activar'}">${alertObj.active ? '⏸️' : '▶️'}</button>
                        <button class="alert-action-btn duplicate-alert-btn" onclick="taskManager.duplicateAlert(${alertObj.id})" title="Duplicar alerta">📋</button>
                        <button class="alert-action-btn remove-alert-btn" onclick="taskManager.removeAlert(${alertObj.id})" title="Eliminar alerta">🗑️</button>
                    </div>
                </div>
                <div class="alert-message">${alertObj.message}</div>
                <div class="alert-date">📅 ${alertDate.toLocaleString()}</div>
                <div class="alert-countdown" id="countdown-${alertObj.id}">${alertObj.active ? timeRemaining : '⏸️ Pausada'}</div>
                ${urlDisplay}
                <div class="alert-status ${alertObj.active ? 'status-active' : 'status-inactive'}">
                    ${alertObj.active ? '🟢 Activa' : '🔴 Inactiva'}
                </div>
            </div>
        `;
        
        alertsList.appendChild(alertElement);
    }

    removeAlert(alertId) {
        const alertElement = document.querySelector(`[data-alert-id="${alertId}"]`);
        if (alertElement) {
            alertElement.remove();
        }
        
        // Cancelar timeout si existe
        if (this.alertTimeouts && this.alertTimeouts[alertId]) {
            clearTimeout(this.alertTimeouts[alertId]);
            delete this.alertTimeouts[alertId];
        }
        
        // Cancelar countdown si existe
        if (this.countdownIntervals && this.countdownIntervals[alertId]) {
            clearInterval(this.countdownIntervals[alertId]);
            delete this.countdownIntervals[alertId];
        }
        
        // Remover de la lista de alertas de la tarea actual
        if (this.currentTaskAlerts) {
            this.currentTaskAlerts = this.currentTaskAlerts.filter(alertObj => alertObj.id !== alertId);
        }
        
        alert('🗑️ Alerta eliminada');
    }

    editAlert(alertId) {
        const alertObj = this.currentTaskAlerts?.find(a => a.id === alertId);
        if (!alertObj) return;
        
        const newDate = prompt('Nueva fecha y hora (YYYY-MM-DDTHH:MM):', alertObj.alertDate);
        if (!newDate) return;
        
        // Validar fecha
        const alertDateTime = new Date(newDate);
        const now = new Date();
        if (alertDateTime <= now) {
            alert('❌ La fecha debe ser en el futuro');
            return;
        }
        
        // Cancelar timeout anterior
        if (this.alertTimeouts && this.alertTimeouts[alertId]) {
            clearTimeout(this.alertTimeouts[alertId]);
            delete this.alertTimeouts[alertId];
        }
        
        // Cancelar countdown anterior
        if (this.countdownIntervals && this.countdownIntervals[alertId]) {
            clearInterval(this.countdownIntervals[alertId]);
            delete this.countdownIntervals[alertId];
        }
        
        // Actualizar alerta
        alertObj.alertDate = newDate;
        
        // Reprogramar si está activa
        if (alertObj.active) {
            this.scheduleAlert(alertObj);
        }
        
        // Actualizar UI
        this.updateAlertInList(alertObj);
        
        alert(`✅ Fecha de alerta actualizada a ${alertDateTime.toLocaleString()}`);
    }

    toggleAlert(alertId) {
        const alertObj = this.currentTaskAlerts?.find(a => a.id === alertId);
        if (!alertObj) return;
        
        alertObj.active = !alertObj.active;
        
        if (alertObj.active) {
            // Activar: programar la alerta
            this.scheduleAlert(alertObj);
            alert(`▶️ Alerta "${alertObj.title}" activada`);
        } else {
            // Desactivar: cancelar timeout y countdown
            if (this.alertTimeouts && this.alertTimeouts[alertId]) {
                clearTimeout(this.alertTimeouts[alertId]);
                delete this.alertTimeouts[alertId];
            }
            if (this.countdownIntervals && this.countdownIntervals[alertId]) {
                clearInterval(this.countdownIntervals[alertId]);
                delete this.countdownIntervals[alertId];
            }
            alert(`⏸️ Alerta "${alertObj.title}" desactivada`);
        }
        
        // Actualizar UI
        this.updateAlertInList(alertObj);
    }

    duplicateAlert(alertId) {
        const originalAlert = this.currentTaskAlerts?.find(a => a.id === alertId);
        if (!originalAlert) return;
        
        // Crear nueva fecha (1 hora después de la original)
        const originalDate = new Date(originalAlert.alertDate);
        const newDate = new Date(originalDate.getTime() + (60 * 60 * 1000)); // +1 hora
        
        const duplicatedAlertId = this.alertIdCounter++;
        const duplicatedAlert = {
            id: duplicatedAlertId, // ID único
            title: `${originalAlert.title} (Copia)`,
            message: originalAlert.message,
            alertDate: newDate.toISOString().slice(0, 16), // Formato YYYY-MM-DDTHH:MM
            webhookUrl: originalAlert.webhookUrl,
            active: true,
            created: new Date().toISOString()
        };
        
        // Agregar a la lista temporal
        this.currentTaskAlerts.push(duplicatedAlert);
        
        // Agregar a la UI
        this.addAlertToList(duplicatedAlert);
        
        // Programar la nueva alerta
        this.scheduleAlert(duplicatedAlert);
        
        alert(`📋 Alerta duplicada: "${duplicatedAlert.title}"`);
    }

    updateAlertInList(alertObj) {
        const alertElement = document.querySelector(`[data-alert-id="${alertObj.id}"]`);
        if (!alertElement) return;
        
        // Remover elemento actual y agregar actualizado
        alertElement.remove();
        this.addAlertToList(alertObj);
    }

    scheduleAlert(alertObj) {
        if (!this.alertTimeouts) {
            this.alertTimeouts = {};
        }
        
        // Cancelar timeout existente si ya existe para esta alerta
        if (this.alertTimeouts[alertObj.id]) {
            console.log('🧹 Cancelando timeout existente para:', alertObj.title);
            clearTimeout(this.alertTimeouts[alertObj.id]);
            delete this.alertTimeouts[alertObj.id];
        }
        
        const alertDate = new Date(alertObj.alertDate);
        const now = new Date();
        const timeUntilAlert = alertDate.getTime() - now.getTime();
        
        if (timeUntilAlert <= 0) {
            console.log('⚠️ Alerta ya vencida:', alertObj.title);
            return;
        }
        
        console.log(`⏰ Programando alerta "${alertObj.title}" en ${timeUntilAlert}ms`);
        
        this.alertTimeouts[alertObj.id] = setTimeout(() => {
            this.triggerAlert(alertObj);
            delete this.alertTimeouts[alertObj.id];
        }, timeUntilAlert);
        
        // Actualizar countdown cada segundo
        this.updateCountdown(alertObj.id, alertDate);
    }

    async triggerAlert(alertObj) {
        console.log('🔔 Disparando alerta:', alertObj.title);
        
        try {
            // Verificar permisos de notificación
            let permission = Notification.permission;
            if (permission === 'default') {
                permission = await Notification.requestPermission();
            }
            
            if (permission === 'denied') {
                console.warn('Permisos de notificación denegados. Permission:', permission);
                // Mostrar alerta en página como fallback
                alert(`🔔 ${alertObj.title}: ${alertObj.message}`);
                return;
            }
            
            console.log('✅ Permisos de notificación otorgados');
            
            // Usar service worker para notificaciones push si está disponible
            if (this.swRegistration) {
                console.log('🔔 Mostrando notificación via service worker:', alertObj.title);
                
                await this.swRegistration.showNotification(alertObj.title, {
                    body: alertObj.message,
                    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="red" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12,6 12,12 16,14"></polyline></svg>',
                    badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="red" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8"/></svg>',
                    tag: 'task-alert-' + alertObj.id,
                    requireInteraction: true,
                    actions: [
                        {
                            action: 'view',
                            title: 'Ver tarea',
                            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="blue" viewBox="0 0 16 16"><path d="M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"/><path d="M0 8s3-5.5 8-5.5S16 8 16 8s-3 5.5-8 5.5S0 8 0 8zm8 3.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/></svg>'
                        }
                    ],
                    data: {
                        alertId: alertObj.id,
                        webhookUrl: alertObj.webhookUrl
                    }
                });
                
                console.log('✅ Notificación push mostrada exitosamente');
                return; // Evitar mostrar notificación duplicada
                
            } else {
                console.log('⚠️ Service Worker no disponible, usando notificación simple');
                // Fallback a notificación simple
                new Notification(alertObj.title, {
                    body: alertObj.message,
                    icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="red" stroke-width="2"%3E%3Ccircle cx="12" cy="12" r="10"%3E%3C/circle%3E%3Cpolyline points="12,6 12,12 16,14"%3E%3C/polyline%3E%3C/svg%3E'
                });
                console.log('✅ Notificación simple mostrada');
            }
            
        } catch (error) {
            console.error('❌ Error mostrando notificación:', error);
            // Fallback final a alerta del navegador
            alert(`🔔 ${alertObj.title}: ${alertObj.message}`);
        }
        
        // Enviar webhook si está configurado
        if (alertObj.webhookUrl) {
            this.sendWebhook(alertObj);
        }
        
        // Marcar alerta como inactiva después de disparar
        alertObj.active = false;
        this.updateAlertInList(alertObj);
    }

    sendWebhook(alertObj) {
        const payload = {
            title: alertObj.title,
            message: alertObj.message,
            alertDate: alertObj.alertDate,
            triggeredAt: new Date().toISOString()
        };
        
        fetch(alertObj.webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        }).then(response => {
            console.log('✅ Webhook enviado:', response.status);
        }).catch(error => {
            console.error('❌ Error enviando webhook:', error);
        });
    }

    getTimeRemaining(alertDate) {
        const now = new Date();
        const diff = alertDate.getTime() - now.getTime();
        
        if (diff <= 0) return '⏰ Vencida';
        
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        if (days > 0) return `⏱️ ${days}d ${hours}h ${minutes}m`;
        if (hours > 0) return `⏱️ ${hours}h ${minutes}m`;
        return `⏱️ ${minutes}m`;
    }

    loadTaskAlerts(alerts) {
        const alertsList = document.getElementById('modalAlertsList');
        if (!alertsList) return;
        
        // Limpiar lista actual
        alertsList.innerHTML = '';
        
        // Inicializar array de alertas de la tarea actual
        this.currentTaskAlerts = [];
        
        // Cargar alertas existentes
        if (alerts && alerts.length > 0) {
            alerts.forEach(alertObj => {
                // Asegurar que la alerta tenga la propiedad active
                if (alertObj.active === undefined) {
                    alertObj.active = true;
                }
                
                this.currentTaskAlerts.push(alertObj);
                this.addAlertToList(alertObj);
                
                // Programar la alerta si está activa y es futura
                if (alertObj.active) {
                    const alertDate = new Date(alertObj.alertDate);
                    const now = new Date();
                    if (alertDate > now) {
                        this.scheduleAlert(alertObj);
                    }
                }
            });
        }
    }

    // === ACTUALIZACIÓN DE COUNTDOWN EN TIEMPO REAL ===
    updateCountdown(alertId, alertDate) {
        const countdownElement = document.getElementById(`countdown-${alertId}`);
        if (!countdownElement) return;
        
        // Limpiar intervalo anterior si existe
        if (this.countdownIntervals[alertId]) {
            clearInterval(this.countdownIntervals[alertId]);
        }
        
        const updateInterval = setInterval(() => {
            const now = new Date();
            const timeRemaining = alertDate.getTime() - now.getTime();
            
            if (timeRemaining <= 0) {
                clearInterval(updateInterval);
                delete this.countdownIntervals[alertId];
                countdownElement.textContent = '⏰ ¡Tiempo cumplido!';
                countdownElement.style.color = '#dc2626';
                countdownElement.style.fontWeight = 'bold';
                return;
            }
            
            // Calcular tiempo restante
            const days = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
            const hours = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);
            
            // Formatear tiempo
            let timeText = '';
            if (days > 0) {
                timeText = `⏱️ ${days}d ${hours}h ${minutes}m ${seconds}s`;
            } else if (hours > 0) {
                timeText = `⏱️ ${hours}h ${minutes}m ${seconds}s`;
            } else if (minutes > 0) {
                timeText = `⏱️ ${minutes}m ${seconds}s`;
            } else {
                timeText = `⏱️ ${seconds}s`;
                // Cambiar color cuando queden menos de 60 segundos
                countdownElement.style.color = '#dc2626';
                countdownElement.style.fontWeight = 'bold';
            }
            
            countdownElement.textContent = timeText;
        }, 1000); // Actualizar cada segundo
        
        // Guardar referencia del intervalo
        this.countdownIntervals[alertId] = updateInterval;
    }

    // === ACTUALIZACIÓN DE BADGES EN TIEMPO REAL ===
    startTimeBadgeUpdater() {
        // Actualizar badges cada minuto
        this.timeBadgeInterval = setInterval(() => {
            this.updateTimeBadges();
        }, 60000); // 60 segundos
        
        console.log('⏰ Iniciado actualizador de badges de tiempo (cada 60 segundos)');
    }
    
    updateTimeBadges() {
        const taskElements = document.querySelectorAll('.task-item[data-task-id]');
        let updatedCount = 0;
        
        taskElements.forEach(taskElement => {
            const taskId = parseInt(taskElement.dataset.taskId);
            const task = this.findTaskById(taskId);
            
            if (task) {
                const taskTextElement = taskElement.querySelector('.task-text');
                if (taskTextElement) {
                    // Regenerar TODOS los badges para esta tarea
                    const badges = this.generateTaskBadges(task);
                    
                    // Regenerar el HTML completo manteniendo la estructura con ID badge
                    taskTextElement.innerHTML = `
                        <span class="task-id-badge">ID:${task.id}</span>
                        ${this.escapeHtml(task.text)}${badges}
                    `;
                    updatedCount++;
                }
            }
        });
        
        if (updatedCount > 0) {
            console.log(`⏰ Actualizados ${updatedCount} badges`);
        }
    }
    
    // Limpiar intervalos al destruir
    destroy() {
        if (this.timeBadgeInterval) {
            clearInterval(this.timeBadgeInterval);
        }
        
        if (this.alertTimeouts) {
            Object.values(this.alertTimeouts).forEach(timeout => clearTimeout(timeout));
        }
        
        if (this.countdownIntervals) {
            Object.values(this.countdownIntervals).forEach(interval => clearInterval(interval));
        }
    }

    // === REGISTRO DE SERVICE WORKER ===
    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                console.log('🔧 Registrando service worker...');
                
                // Limpiar service workers anteriores
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (let registration of registrations) {
                    await registration.unregister();
                    console.log('🧹 Service worker anterior desregistrado');
                }
                
                // Registrar nuevo service worker
                const registration = await navigator.serviceWorker.register('/sw.js', {
                    scope: './'
                });
                
                console.log('✅ Service worker registrado:', registration);
                await navigator.serviceWorker.ready;
                
                this.swRegistration = registration;
                console.log('✅ Service worker listo para notificaciones');
                
            } catch (error) {
                console.error('❌ Error registrando service worker:', error);
            }
        } else {
            console.log('⚠️ Service Worker no disponible en este navegador');
        }
    }

    // ===== MÉTODOS DEL ASISTENTE IA =====
    
    // ===== ASSISTANT CONTEXT MANAGEMENT =====
    updateAssistantContext() {
        // Siempre usar módulo Tareas con el contexto actual seleccionado
        // El módulo General queda para acceso manual cuando el usuario lo desee
        this.selectModule('tasks');
    }
    
    updateContextDisplay() {
        // Actualizar el display del contexto actual
        const currentScenarioSpan = document.getElementById('current-scenario');
        const currentProjectSpan = document.getElementById('current-project');
        
        if (currentScenarioSpan && currentProjectSpan) {
            const scenarioName = this.data[this.currentScenario]?.name || 'Por defecto';
            const projectName = this.data[this.currentScenario]?.projects[this.currentProject]?.name || 'Sin proyecto';
            
            currentScenarioSpan.textContent = scenarioName;
            currentProjectSpan.textContent = projectName;
        }
    }

    initAssistant() {
        this.loadAssistantData();
        this.setupAssistantEventListeners();
        this.updateAssistantContext();
    }
    
    loadAssistantData() {
        try {
            const savedConfig = localStorage.getItem('taskTreeAIConfig');
            if (savedConfig) {
                this.aiConfig = { ...this.aiConfig, ...JSON.parse(savedConfig) };
            }
            
            const savedStats = localStorage.getItem('taskTreeAIStats');
            if (savedStats) {
                this.aiStats = { ...this.aiStats, ...JSON.parse(savedStats) };
            }
            
            const savedMessages = localStorage.getItem('taskTreeAIMessages');
            if (savedMessages) {
                this.mensajes = JSON.parse(savedMessages);
                this.renderChatMessages();
            }
            
            const savedPrompts = localStorage.getItem('taskTreeAIPrompts');
            if (savedPrompts) {
                this.promptContexts = { ...this.promptContexts, ...JSON.parse(savedPrompts) };
            }
        } catch (error) {
            console.error('Error cargando datos del asistente:', error);
        }
    }
    
    setupAssistantEventListeners() {
        // Los eventos ya están manejados en handleClick y handleKeydown
    }
    
    toggleAssistant() {
        this.assistantVisible = !this.assistantVisible;
        const content = document.getElementById('assistantContent');
        const toggleBtn = document.getElementById('toggleAssistant');
        
        if (this.assistantVisible) {
            content.style.display = 'block';
            toggleBtn.textContent = 'Ocultar';
            this.updateAssistantContext();
            // Cargar proyectos inicialmente si ya hay escenarios seleccionados
            this.loadAssistantProjects();
        } else {
            content.style.display = 'none';
            toggleBtn.textContent = 'Mostrar';
        }
    }
    
    selectModule(module) {
        this.currentModule = module;
        
        // Actualizar UI
        document.querySelectorAll('.module-option').forEach(option => {
            option.classList.toggle('active', option.dataset.module === module);
        });
        
        // Mostrar/ocultar display de contexto
        const contextDisplay = document.getElementById('context-display');
        if (contextDisplay) {
            contextDisplay.style.display = module === 'tasks' ? 'block' : 'none';
        }
        
        // Actualizar el display del contexto actual
        if (module === 'tasks') {
            this.updateContextDisplay();
        }
    }
    
    loadAssistantContext() {
        if (this.currentModule === 'tasks') {
            this.loadAssistantScenarios();
            this.loadAssistantProjects();
        }
    }
    
    loadAssistantScenarios() {
        const scenariosButtons = document.getElementById('scenarios-buttons');
        if (!scenariosButtons) return;
        
        // Usar el mismo patrón que updateFilterTags
        const scenarios = Object.values(this.data).filter(scenario => scenario.id);
        
        if (scenarios.length === 0) {
            scenariosButtons.innerHTML = '<span class="no-tags-message">No hay escenarios disponibles</span>';
            return;
        }
        
        scenariosButtons.innerHTML = scenarios.map(scenario => 
            `<span class="filter-tag ${this.selectedScenarios.has(scenario.id.toString()) ? 'active' : ''}" 
                   data-scenario="${scenario.id}" 
                   onclick="taskManager.toggleScenarioFilter('${scenario.id}')">${scenario.icon} ${scenario.name}</span>`
        ).join('');
        
        console.log('Escenarios cargados:', scenarios.map(s => s.id));
    }
    
    loadAssistantProjects() {
        const projectsButtons = document.getElementById('projects-buttons');
        if (!projectsButtons) return;
        
        // Si no hay escenarios seleccionados, no mostrar proyectos
        if (this.selectedScenarios.size === 0) {
            projectsButtons.innerHTML = '<span class="no-tags-message">Selecciona un escenario primero</span>';
            return;
        }
        
        // Obtener proyectos de los escenarios seleccionados
        const projectsMap = new Map();
        this.selectedScenarios.forEach(scenarioId => {
            const scenario = this.data[scenarioId];
            if (scenario && scenario.projects) {
                Object.values(scenario.projects).forEach(project => {
                    projectsMap.set(project.id, project);
                });
            }
        });
        
        // Si no hay proyectos en los escenarios seleccionados
        if (projectsMap.size === 0) {
            projectsButtons.innerHTML = '<span class="no-tags-message">No hay proyectos en los escenarios seleccionados</span>';
            return;
        }
        
        // Usar el mismo patrón que updateFilterTags
        const projects = Array.from(projectsMap.values());
        projectsButtons.innerHTML = projects.map(project => 
            `<span class="filter-tag ${this.selectedProjects.has(project.id.toString()) ? 'active' : ''}" 
                   data-project="${project.id}" 
                   onclick="taskManager.toggleProjectFilter('${project.id}')">${project.icon} ${project.name}</span>`
        ).join('');
        
        console.log('Proyectos cargados:', projects.map(p => p.id));
    }
    
    toggleScenarioFilter(scenarioId) {
        if (this.selectedScenarios.has(scenarioId.toString())) {
            // No permitir deseleccionar si es el único seleccionado
            if (this.selectedScenarios.size <= 1) {
                console.log('No se puede deseleccionar: debe quedar al menos un escenario seleccionado');
                return;
            }
            this.selectedScenarios.delete(scenarioId.toString());
        } else {
            this.selectedScenarios.add(scenarioId.toString());
        }
        
        // Actualizar visibilidad del escenario
        const scenarioElement = document.querySelector(`[data-scenario="${scenarioId}"]`);
        if (scenarioElement) {
            scenarioElement.classList.toggle('active', this.selectedScenarios.has(scenarioId.toString()));
        }
        
        // Al cambiar escenarios, limpiar proyectos que ya no estén disponibles
        this.cleanupSelectedProjects();
        this.loadAssistantProjects();
        
        console.log('Escenarios seleccionados:', Array.from(this.selectedScenarios));
    }
    
    toggleProjectFilter(projectId) {
        if (this.selectedProjects.has(projectId.toString())) {
            // No permitir deseleccionar si es el único seleccionado
            if (this.selectedProjects.size <= 1) {
                console.log('No se puede deseleccionar: debe quedar al menos un proyecto seleccionado');
                return;
            }
            this.selectedProjects.delete(projectId.toString());
        } else {
            this.selectedProjects.add(projectId.toString());
        }
        
        // Actualizar visibilidad del proyecto
        const projectElement = document.querySelector(`[data-project="${projectId}"]`);
        if (projectElement) {
            projectElement.classList.toggle('active', this.selectedProjects.has(projectId.toString()));
        }
        
        console.log('Proyectos seleccionados:', Array.from(this.selectedProjects));
    }
    
    // Método obsoleto - ahora usamos toggleScenarioFilter y toggleProjectFilter
    
    cleanupSelectedProjects() {
        // Obtener todos los proyectos disponibles en los escenarios seleccionados
        const availableProjects = new Set();
        this.selectedScenarios.forEach(scenarioId => {
            const scenario = this.data[scenarioId];
            if (scenario && scenario.projects) {
                Object.values(scenario.projects).forEach(project => {
                    availableProjects.add(project.id.toString());
                });
            }
        });
        
        // Remover proyectos seleccionados que ya no están disponibles
        this.selectedProjects.forEach(projectId => {
            if (!availableProjects.has(projectId)) {
                this.selectedProjects.delete(projectId);
            }
        });
    }
    
    sendMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        
        if (!message) return;
        
        // Verificar API Key
        if (!this.aiConfig.apiKey) {
            this.showNotification('Configura tu API Key primero', 'error');
            this.showAIConfigModal();
            return;
        }
        
        // Agregar mensaje del usuario
        this.mensajes.push({
            role: 'user',
            content: message,
            timestamp: new Date()
        });
        
        input.value = '';
        this.renderChatMessages();
        
        // Agregar indicador de carga
        const loadingMessage = {
            role: 'assistant',
            content: '🤖 Escribiendo...',
            timestamp: new Date(),
            isLoading: true
        };
        this.mensajes.push(loadingMessage);
        this.renderChatMessages();
        
        // Llamar a la API real
        this.callAIAPI(message);
    }
    
    async callAIAPI(userMessage) {
        try {
            const context = this.getSelectedContext();
            const systemPrompt = this.buildSystemPrompt(context);
            
            // Preparar historial de mensajes para la API (excluyendo el mensaje de carga)
            const apiMessages = this.mensajes
                .filter(m => !m.isLoading)
                .slice(-this.aiConfig.historyLimit)
                .map(m => ({ role: m.role, content: m.content }));

            const messages = [
                { role: 'system', content: systemPrompt },
                ...apiMessages,
                { role: 'user', content: userMessage }
            ];

            const requestBody = {
                model: this.aiConfig.model,
                messages: messages
            };
            
            // Usar max_completion_tokens para modelos GPT-5, max_tokens para otros
            if (this.aiConfig.model.startsWith('gpt-5')) {
                requestBody.max_completion_tokens = this.aiConfig.maxTokens;
                requestBody.temperature = 1; // GPT-5 solo soporta temperature = 1
            } else {
                requestBody.max_tokens = this.aiConfig.maxTokens;
                requestBody.temperature = this.aiConfig.temperature;
            }

            // Agregar función genérica para manipular datos
            requestBody.functions = this.getDataManipulationFunctions();

            const startTime = Date.now();
            
            // Usar OpenAI API para todos los modelos (como en el original)
            const apiUrl = 'https://api.openai.com/v1/chat/completions';
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.aiConfig.apiKey}`
            };

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();
            const endTime = Date.now();

            // Remover mensaje de carga
            this.mensajes = this.mensajes.filter(m => !m.isLoading);

            if (!response.ok) {
                console.error('Error en la API:', data);
                const errorMessage = data.error ? data.error.message : `Error ${response.status}`;
                this.mensajes.push({
                    role: 'assistant',
                    content: `❌ **Error de API:** ${errorMessage}`,
                    timestamp: new Date()
                });
                this.renderChatMessages();
                this.saveAssistantData();
                return;
            }

            // Actualizar estadísticas si están disponibles
            if (data.usage) {
                const { prompt_tokens, completion_tokens, total_tokens } = data.usage;
                this.updateAIStats(prompt_tokens || 0, completion_tokens || 0);
            }

            if (data.choices && data.choices.length > 0) {
                const msg = data.choices[0].message;
                
                // Verificar si hay function_call
                if (msg.hasOwnProperty('function_call')) {
                    const nombreFuncion = msg.function_call.name;
                    const args = JSON.parse(msg.function_call.arguments);
                    let resultado;
                    
                    switch(nombreFuncion) {
                        case 'manipularDatos':
                            resultado = await this.manipularDatos(args, context);
                            break;
                        default:
                            resultado = '❌ Función no reconocida.';
                    }

                    // Hacer una segunda llamada para obtener la respuesta final
                    const finalRequestBody = {
                        model: this.aiConfig.model,
                        messages: [
                            { role: 'system', content: systemPrompt + " Responde de forma muy concisa." },
                            ...apiMessages.slice(-3),
                            { role: 'user', content: userMessage },
                            { role: 'function', name: nombreFuncion, content: resultado }
                        ]
                    };
                    
                    // Usar max_completion_tokens para modelos GPT-5, max_tokens para otros
                    if (this.aiConfig.model.startsWith('gpt-5')) {
                        finalRequestBody.max_completion_tokens = Math.min(this.aiConfig.maxTokens, 200);
                        finalRequestBody.temperature = 1;
                    } else {
                        finalRequestBody.max_tokens = Math.min(this.aiConfig.maxTokens, 200);
                        finalRequestBody.temperature = 0.3;
                    }
                    
                    const finalResponse = await fetch(apiUrl, {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify(finalRequestBody)
                    });

                    const finalData = await finalResponse.json();
                    if (finalData.choices && finalData.choices.length > 0) {
                        const assistantMessage = finalData.choices[0].message.content;
                        this.mensajes.push({
                            role: 'assistant',
                            content: assistantMessage,
                            timestamp: new Date()
                        });
                    } else {
                        this.mensajes.push({
                            role: 'assistant',
                            content: resultado,
                            timestamp: new Date()
                        });
                    }
                } else {
                    this.mensajes.push({
                        role: 'assistant',
                        content: msg.content,
                        timestamp: new Date()
                    });
                }

                this.renderChatMessages();
                this.saveAssistantData();
            } else {
                throw new Error('No se recibió respuesta válida de la API');
            }

        } catch (error) {
            console.error('Error llamando a la API:', error);
            
            // Remover mensaje de carga
            this.mensajes = this.mensajes.filter(m => !m.isLoading);
            
            this.mensajes.push({
                role: 'assistant',
                content: `❌ **Error de conexión:** ${error.message}. Verifica tu API Key y conexión a internet.`,
                timestamp: new Date()
            });
            
            this.renderChatMessages();
            this.saveAssistantData();
        }
    }

    // ===== FUNCTIONS FOR AI =====
    getDataManipulationFunctions() {
        return [
            {
                name: 'manipularDatos',
                description: 'Función genérica para manipular datos del JSON. Puede agregar, editar, eliminar o consultar cualquier tipo de dato (tareas, notas, proyectos, carpetas, etc.)',
                parameters: {
                    type: 'object',
                    properties: {
                        operacion: {
                            type: 'string',
                            enum: ['obtener', 'agregar', 'editar', 'eliminar', 'marcar_completada', 'marcar_pendiente'],
                            description: 'Tipo de operación a realizar'
                        },
                        tipo: {
                            type: 'string',
                            enum: ['tasks', 'notes', 'projects', 'folders'],
                            description: 'Tipo de datos a manipular'
                        },
                        datos: {
                            type: 'array',
                            description: 'Array de objetos con los datos a manipular. Para editar/eliminar incluir el ID.',
                            items: {
                                type: 'object',
                                properties: {
                                    id: { type: 'integer', description: 'ID del elemento (para editar/eliminar)' },
                                    title: { type: 'string', description: 'Título/nombre del elemento' },
                                    description: { type: 'string', description: 'Descripción detallada de la tarea' },
                                    parentId: { type: 'integer', description: 'ID de la tarea padre (para crear subtareas)' },
                                    priority: { type: 'string', enum: ['alta', 'media', 'baja'], description: 'Prioridad de la tarea' },
                                    dueDate: { type: 'string', description: 'Fecha límite en formato ISO (YYYY-MM-DD)' },
                                    repeat: { type: 'string', enum: ['daily', 'weekly', 'monthly'], description: 'Tipo de repetición' },
                                    repeatCount: { type: 'integer', description: 'Número de repeticiones' },
                                    tags: { type: 'array', items: { type: 'string' }, description: 'Etiquetas/tags de la tarea' },
                                    completed: { type: 'boolean', description: 'Estado completado' },
                                    projectId: { type: 'integer', description: 'ID del proyecto' },
                                    folderId: { type: 'integer', description: 'ID de la carpeta' },
                                    color: { type: 'string', description: 'Color hex para proyectos/carpetas' },
                                    content: { type: 'string', description: 'Contenido de la nota' }
                                }
                            }
                        },
                        escenario: {
                            type: 'string',
                            description: 'ID del escenario donde realizar la operación (opcional, usa el seleccionado por defecto)'
                        }
                    },
                    required: ['operacion', 'tipo']
                }
            }
        ];
    }

    async manipularDatos(args, context) {
        const { operacion, tipo, datos = [], escenario } = args;
        
        try {
            // Para Tasks, usar directamente los métodos del TaskManager
            if (tipo === 'tasks') {
                switch(operacion) {
                    case 'agregar':
                        let results = [];
                        for (const tarea of datos) {
                            const parentId = tarea.parentId || null;
                            
                            // Crear tarea manualmente para evitar múltiples renderizados
                            const taskId = this.generateUniqueId();
                            const newTask = {
                                id: taskId,
                                text: tarea.title,
                                completed: false,
                                parentId,
                                children: [],
                                expanded: true,
                                depth: this.calculateDepth(parentId),
                                priority: tarea.priority || 'media',
                                description: tarea.description || '',
                                dueDate: tarea.dueDate || null,
                                repeat: tarea.repeat || null,
                                repeatCount: tarea.repeatCount || null,
                                tags: tarea.tags || []
                            };
                            
                            // Configurar completed si se especifica
                            if (tarea.completed !== undefined) newTask.completed = tarea.completed;
                            
                            // Agregar la tarea al lugar correcto
                            if (parentId) {
                                const parent = this.findTaskById(parentId);
                                if (parent) {
                                    parent.children.push(newTask);
                                    parent.expanded = true;
                                }
                            } else {
                                this.getCurrentTasks().push(newTask);
                            }
                            
                            const taskType = parentId ? 'Subtarea' : 'Tarea';
                            const parentInfo = parentId ? ` (subtarea de ID: ${parentId})` : '';
                            const propsInfo = [];
                            if (tarea.priority) propsInfo.push(`prioridad: ${tarea.priority}`);
                            if (tarea.dueDate) propsInfo.push(`fecha: ${tarea.dueDate}`);
                            if (tarea.tags?.length) propsInfo.push(`etiquetas: ${tarea.tags.join(', ')}`);
                            const additionalInfo = propsInfo.length ? ` (${propsInfo.join(', ')})` : '';
                            
                            results.push(`✅ ${taskType} agregada: "${tarea.title}" (ID: ${newTask.id})${parentInfo}${additionalInfo}`);
                        }
                        // Guardar y renderizar una sola vez al final
                        this.saveAndRender();
                        return results.join('\n');
                    
                    case 'editar':
                        let editResults = [];
                        for (const tarea of datos) {
                            if (tarea.id) {
                                const task = this.findTaskById(tarea.id);
                                if (task) {
                                    if (tarea.title) task.text = tarea.title;
                                    if (tarea.description !== undefined) task.description = tarea.description;
                                    if (tarea.priority) task.priority = tarea.priority;
                                    if (tarea.dueDate !== undefined) task.dueDate = tarea.dueDate;
                                    if (tarea.repeat !== undefined) task.repeat = tarea.repeat;
                                    if (tarea.repeatCount !== undefined) task.repeatCount = tarea.repeatCount;
                                    if (tarea.tags && Array.isArray(tarea.tags)) task.tags = tarea.tags;
                                    if (tarea.completed !== undefined) task.completed = tarea.completed;
                                    
                                    const changes = [];
                                    if (tarea.title) changes.push(`título: "${tarea.title}"`);
                                    if (tarea.priority) changes.push(`prioridad: ${tarea.priority}`);
                                    if (tarea.dueDate !== undefined) changes.push(`fecha: ${tarea.dueDate || 'sin fecha'}`);
                                    if (tarea.tags?.length) changes.push(`etiquetas: ${tarea.tags.join(', ')}`);
                                    
                                    const changesInfo = changes.length ? ` - Cambios: ${changes.join(', ')}` : '';
                                    editResults.push(`✅ Tarea editada: "${task.text}" (ID: ${task.id})${changesInfo}`);
                                } else {
                                    editResults.push(`❌ No se encontró la tarea con ID: ${tarea.id}`);
                                }
                            }
                        }
                        this.saveAndRender();
                        return editResults.join('\n');
                    
                    case 'eliminar':
                        let deleteResults = [];
                        for (const tarea of datos) {
                            if (tarea.id) {
                                const task = this.findTaskById(tarea.id);
                                if (task) {
                                    this.deleteTaskById(tarea.id);
                                    deleteResults.push(`✅ Tarea eliminada: "${task.text}" (ID: ${tarea.id})`);
                                } else {
                                    deleteResults.push(`❌ No se encontró la tarea con ID: ${tarea.id}`);
                                }
                            }
                        }
                        return deleteResults.join('\n');
                    
                    case 'marcar_completada':
                    case 'marcar_pendiente':
                        let toggleResults = [];
                        const completed = operacion === 'marcar_completada';
                        for (const tarea of datos) {
                            if (tarea.id) {
                                const task = this.findTaskById(tarea.id);
                                if (task) {
                                    task.completed = completed;
                                    toggleResults.push(`✅ Tarea ${completed ? 'completada' : 'marcada como pendiente'}: "${task.text}" (ID: ${task.id})`);
                                } else {
                                    toggleResults.push(`❌ No se encontró la tarea con ID: ${tarea.id}`);
                                }
                            }
                        }
                        this.saveAndRender();
                        return toggleResults.join('\n');
                    
                    case 'obtener':
                        // Obtener tareas del contexto actual (escenario y proyecto actual)
                        const currentTasks = this.getCurrentTasks();
                        const scenarioName = this.data[this.currentScenario]?.name || 'Desconocido';
                        const projectName = this.data[this.currentScenario]?.projects[this.currentProject]?.name || 'Desconocido';
                        
                        return `📋 Tareas en "${scenarioName}" - "${projectName}": ${currentTasks.length}\n\n${currentTasks.map(t => `• ID: ${t.id} - ${t.text} ${t.completed ? '✅' : '⏳'}`).join('\n')}`;
                    
                    default:
                        return `❌ Operación "${operacion}" no reconocida para tareas`;
                }
            }
            
            // Para proyectos y escenarios
            if (tipo === 'projects') {
                switch(operacion) {
                    case 'agregar':
                        let projectResults = [];
                        for (const proyecto of datos) {
                            const newProject = {
                                id: Date.now() + Math.random(),
                                name: proyecto.title,
                                color: proyecto.color || '#007bff'
                            };
                            // Agregar al escenario actual
                            this.data[this.currentScenario].projects[newProject.id] = newProject;
                            this.saveProjectsAndScenarios();
                            this.loadProjectsAndScenarios();
                            projectResults.push(`✅ Proyecto agregado: "${proyecto.title}" (ID: ${newProject.id})`);
                        }
                        return projectResults.join('\n');
                    
                    case 'obtener':
                        const projects = Object.values(this.data[this.currentScenario]?.projects || {});
                        return `📂 Proyectos: ${projects.length}\n\n${projects.map(p => `• ID: ${p.id} - ${p.name}`).join('\n')}`;
                    
                    default:
                        return `❌ Operación "${operacion}" no soportada para proyectos`;
                }
            }
            
            return `❌ Tipo de datos "${tipo}" no soportado actualmente`;
            
        } catch (error) {
            console.error('Error en manipularDatos:', error);
            return `❌ Error ejecutando operación: ${error.message}`;
        }
    }
    
    buildSystemPrompt(context) {
        // Obtener el prompt base del contexto actual
        const basePrompt = this.promptContexts[this.currentModule]?.systemPrompt || 
                          this.promptContexts.general.systemPrompt;
        
        let systemPrompt = basePrompt + '\n\n';
        
        // Agregar información de fecha y hora
        const now = new Date();
        const today = now.toISOString().split('T')[0]; // YYYY-MM-DD
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        systemPrompt += `FECHA Y HORA ACTUAL: ${now.toLocaleDateString('es-ES')} a las ${now.toLocaleTimeString('es-ES')}.\n`;
        systemPrompt += `FECHA ACTUAL ISO: ${today}\n`;
        systemPrompt += `MAÑANA ISO: ${tomorrow}\n\n`;
        systemPrompt += `IMPORTANTE: Cuando el usuario diga "mañana", usa la fecha: ${tomorrow}\n`;
        systemPrompt += `Cuando diga "hoy", usa la fecha: ${today}\n\n`;
        
        if (this.currentModule === 'general') {
            // MÓDULO GENERAL: Acceso completo a toda la base de datos
            systemPrompt += `BASE DE DATOS COMPLETA:\n`;
            systemPrompt += `Tienes acceso completo a toda la información del usuario:\n`;
            systemPrompt += `- Todos los escenarios y sus proyectos\n`;
            systemPrompt += `- Todas las tareas de todos los contextos\n`;
            systemPrompt += `- Puedes consultar, crear, editar y eliminar elementos en cualquier contexto\n\n`;
            systemPrompt += `DATOS DISPONIBLES:\n`;
            systemPrompt += `${JSON.stringify(this.data, null, 2)}\n\n`;
            systemPrompt += `Responde basándote en toda esta información disponible.`;
        } else {
            // MÓDULO TAREAS: Contexto específico del trabajo actual
            const currentScenarioName = this.data[this.currentScenario]?.name || 'Por defecto';
            const currentProjectName = this.data[this.currentScenario]?.projects[this.currentProject]?.name || 'Sin proyecto';
            systemPrompt += `CONTEXTO DE TRABAJO ACTUAL:\n`;
            systemPrompt += `- Estás trabajando en el escenario: "${currentScenarioName}"\n`;
            systemPrompt += `- Proyecto actual: "${currentProjectName}"\n`;
            systemPrompt += `- Las tareas que menciones o manipules están en este contexto.\n\n`;
            systemPrompt += `CAPACIDADES COMPLETAS DE GESTIÓN DE TAREAS:\n`;
            systemPrompt += `- **Crear tareas**: Con título, descripción, prioridad (alta/media/baja), fecha límite\n`;
            systemPrompt += `- **Crear subtareas**: Usa "parentId" con el ID de la tarea padre\n`;
            systemPrompt += `- **Etiquetas**: Agrega arrays de tags ["urgente", "trabajo", "personal"]\n`;
            systemPrompt += `- **Fechas**: SIEMPRE usa formato ISO (YYYY-MM-DD). Para "mañana" usa ${new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]}, para "hoy" usa ${today}\n`;
            systemPrompt += `- **Repeticiones**: daily/weekly/monthly con repeatCount\n`;
            systemPrompt += `- **Editar todo**: Cambiar cualquier propiedad de tareas existentes\n`;
            systemPrompt += `- **Estado**: Marcar completadas/pendientes\n`;
            systemPrompt += `- **Eliminar**: Remover tareas y todas sus subtareas\n\n`;
            
            // Agregar contexto seleccionado si está disponible
            if (context.scenarios.length > 0 || context.projects.length > 0) {
                systemPrompt += 'CONTEXTO SELECCIONADO:\n';
                
                if (context.scenarios.length > 0) {
                    systemPrompt += `- Escenarios seleccionados: ${context.scenarios.map(s => s.name).join(', ')}\n`;
                }
                
                if (context.projects.length > 0) {
                    systemPrompt += `- Proyectos seleccionados: ${context.projects.map(p => p.name).join(', ')}\n`;
                    
                    // Agregar detalles completos de los proyectos
                    context.projects.forEach(project => {
                        systemPrompt += `\n**PROYECTO: ${project.name}**\n`;
                        systemPrompt += `- Descripción: ${project.description}\n`;
                        if (project.details && project.details.trim()) {
                            systemPrompt += `- Detalles: ${project.details}\n`;
                        }
                        systemPrompt += `- ID: ${project.id}\n`;
                    });
                }
                
                // Agregar información de tareas relacionadas
                const relatedTasks = this.getTasksFromContext(context);
                if (relatedTasks.length > 0) {
                    systemPrompt += `- Tareas relacionadas: ${relatedTasks.length} tareas disponibles\n`;
                }
                
                systemPrompt += '\n';
            }
            
            systemPrompt += 'Responde de manera útil y concisa basándote en este contexto específico.';
        }
        
        return systemPrompt;
    }
    
    generateContextualResponse(userMessage) {
        const context = this.getSelectedContext();
        const hasContext = context.scenarios.length > 0 || context.projects.length > 0;
        
        // Obtener el prompt del contexto actual
        const contextPrompt = this.promptContexts[this.currentModule]?.systemPrompt || this.promptContexts.general.systemPrompt;
        
        // Construir contexto de tareas si está disponible
        let contextInfo = '';
        if (this.currentModule === 'tasks' && hasContext) {
            const scenarioNames = context.scenarios.map(s => s.name).join(', ');
            const projectNames = context.projects.map(p => p.name).join(', ');
            
            contextInfo = `\n\nContexto actual:
- Escenarios: ${scenarioNames || 'Ninguno'}
- Proyectos: ${projectNames || 'Ninguno'}`;
            
            // Obtener tareas relacionadas
            const relatedTasks = this.getTasksFromContext(context);
            if (relatedTasks.length > 0) {
                contextInfo += `\n- Tareas relacionadas: ${relatedTasks.length} tareas encontradas`;
            }
        }
        
        return `Siguiendo mi configuración: "${contextPrompt}"

Tu consulta: "${userMessage}"${contextInfo}

Esta es una respuesta de ejemplo basada en el prompt personalizado. Para obtener respuestas reales de IA:

1. Configura tu API Key
2. Integra con OpenAI/Anthropic API
3. El sistema enviará el prompt personalizado + contexto + tu mensaje

Configuración actual:
• Modelo: ${this.aiStats.currentModel}
• Prompt activo: ${this.currentModule === 'general' ? 'General' : 'Tareas'}
• Tokens estimados: ~${Math.ceil(userMessage.length / 4)} entrada`;
    }
    
    getTasksFromContext(context) {
        const tasks = [];
        
        // Buscar tareas en los escenarios y proyectos seleccionados
        context.scenarios.forEach(scenario => {
            context.projects.forEach(project => {
                if (scenario.projects && scenario.projects[project.id] && scenario.projects[project.id].tasks) {
                    tasks.push(...scenario.projects[project.id].tasks);
                }
            });
        });
        
        return tasks;
    }
    
    getSelectedContext() {
        const context = {
            scenarios: [],
            projects: []
        };
        
        // Usar directamente el contexto actual
        if (this.data[this.currentScenario]) {
            context.scenarios.push(this.data[this.currentScenario]);
            
            if (this.data[this.currentScenario].projects[this.currentProject]) {
                context.projects.push(this.data[this.currentScenario].projects[this.currentProject]);
            }
        }
        
        return context;
    }
    
    renderChatMessages() {
        const container = document.getElementById('chatMessages');
        if (!container) return;
        
        container.innerHTML = this.mensajes.map(msg => {
            let content = msg.content;
            
            // Procesar markdown básico para mejor formato
            content = content
                // Negritas **texto**
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                // Saltos de línea
                .replace(/\n/g, '<br>')
                // Listas con -
                .replace(/^- (.*?)$/gm, '• $1')
                // IDs destacados
                .replace(/ID (\d+)/g, '<span class="task-id">ID $1</span>');
            
            return `
                <div class="message ${msg.role}">
                    <div class="message-content">${content}</div>
                    <div class="message-time">${new Date(msg.timestamp).toLocaleTimeString()}</div>
                </div>
            `;
        }).join('');
        
        container.scrollTop = container.scrollHeight;
    }
    
    saveAssistantData() {
        try {
            localStorage.setItem('taskTreeAIConfig', JSON.stringify(this.aiConfig));
            localStorage.setItem('taskTreeAIStats', JSON.stringify(this.aiStats));
            localStorage.setItem('taskTreeAIMessages', JSON.stringify(this.mensajes));
            this.savePromptContexts();
        } catch (error) {
            console.error('Error guardando datos del asistente:', error);
        }
    }
    
    toggleAllSelection(type) {
        const container = document.getElementById(`${type}-buttons`);
        if (!container) return;
        
        const allTags = container.querySelectorAll('.filter-tag');
        const allSelected = Array.from(allTags).every(tag => tag.classList.contains('active'));
        
        if (allSelected) {
            // Si todos están seleccionados, deseleccionar todos menos el primero
            let isFirst = true;
            allTags.forEach(tag => {
                if (type === 'scenarios') {
                    const scenarioId = tag.dataset.scenario;
                    if (scenarioId && !isFirst) {
                        this.selectedScenarios.delete(scenarioId.toString());
                        tag.classList.remove('active');
                    }
                } else if (type === 'projects') {
                    const projectId = tag.dataset.project;
                    if (projectId && !isFirst) {
                        this.selectedProjects.delete(projectId.toString());
                        tag.classList.remove('active');
                    }
                }
                isFirst = false;
            });
        } else {
            // Seleccionar todos
            allTags.forEach(tag => {
                if (type === 'scenarios') {
                    const scenarioId = tag.dataset.scenario;
                    if (scenarioId && !this.selectedScenarios.has(scenarioId)) {
                        this.toggleScenarioFilter(scenarioId);
                    }
                } else if (type === 'projects') {
                    const projectId = tag.dataset.project;
                    if (projectId && !this.selectedProjects.has(projectId)) {
                        this.toggleProjectFilter(projectId);
                    }
                }
            });
        }
    }
    
    showAIConfigModal() {
        const promptContextOptions = Object.values(this.promptContexts).map(context => 
            `<option value="${context.id}">${context.icon} ${context.name}</option>`
        ).join('');

        const modalContent = `
            <div class="ai-config-modal">
                <div class="config-tabs">
                    <button class="config-tab active" data-tab="general" onclick="taskManager.switchConfigTab('general')">🔧 General</button>
                    <button class="config-tab" data-tab="prompts" onclick="taskManager.switchConfigTab('prompts')">💬 Prompts</button>
                </div>
                
                <!-- Tab General -->
                <div id="config-tab-general" class="config-tab-content active">
                    <h3>Configuración General</h3>
                    
                    <div class="config-section">
                        <label for="ai-api-key">API Key:</label>
                        <input type="password" id="ai-api-key" value="${this.aiConfig.apiKey}" 
                               placeholder="Introduce tu API Key">
                    </div>
                    
                    <div class="config-section">
                        <label for="ai-model">Modelo:</label>
                        <select id="ai-model">
                            <option value="gpt-5-nano" ${this.aiConfig.model === 'gpt-5-nano' ? 'selected' : ''}>
                                GPT-5 Nano ($0.00005/$0.0004 por 1K tokens)
                            </option>
                            <option value="gpt-5-mini" ${this.aiConfig.model === 'gpt-5-mini' ? 'selected' : ''}>
                                GPT-5 Mini ($0.00025/$0.002 por 1K tokens)
                            </option>
                            <option value="gpt-5" ${this.aiConfig.model === 'gpt-5' ? 'selected' : ''}>
                                GPT-5 ($0.00125/$0.01 por 1K tokens)
                            </option>
                        </select>
                    </div>
                    
                    <div class="config-section">
                        <label for="ai-max-tokens">Máximo de Tokens:</label>
                        <input type="number" id="ai-max-tokens" value="${this.aiConfig.maxTokens}" 
                               min="100" max="4000" step="100">
                    </div>
                    
                    <div class="config-section">
                        <label for="ai-temperature">Creatividad (Temperature):</label>
                        <input type="range" id="ai-temperature" value="${this.aiConfig.temperature}" 
                               min="0" max="1" step="0.1">
                        <span class="range-value">${this.aiConfig.temperature}</span>
                    </div>
                    
                    <div class="config-section">
                        <label for="ai-history-limit">Límite del Historial:</label>
                        <input type="number" id="ai-history-limit" value="${this.aiConfig.historyLimit}" 
                               min="5" max="50" step="5">
                    </div>
                </div>
                
                <!-- Tab Prompts -->
                <div id="config-tab-prompts" class="config-tab-content">
                    <h3>Configuración de Prompts</h3>
                    
                    <div class="config-section">
                        <label for="prompt-context-select">Contexto:</label>
                        <select id="prompt-context-select" onchange="taskManager.loadPromptForContext(this.value)">
                            ${promptContextOptions}
                        </select>
                    </div>
                    
                    <div class="config-section">
                        <label for="system-prompt-input">System Prompt:</label>
                        <textarea id="system-prompt-input" rows="6" 
                                  placeholder="Escribe el prompt del sistema para este contexto...">${this.promptContexts[this.currentModule]?.systemPrompt || this.promptContexts.general.systemPrompt}</textarea>
                        <small class="help-text">Este prompt define cómo se comportará el asistente en este contexto específico.</small>
                    </div>
                    
                    <div class="prompt-actions">
                        <button type="button" class="btn-secondary" onclick="taskManager.resetPromptToDefault()">
                            🔄 Restaurar por defecto
                        </button>
                        <button type="button" class="btn-primary" onclick="taskManager.savePromptForContext()">
                            💾 Guardar Prompt
                        </button>
                    </div>
                </div>
                
                <div class="modal-actions">
                    <button type="button" class="btn-secondary" onclick="taskManager.hideModal()">Cancelar</button>
                    <button type="button" class="btn-primary" onclick="taskManager.saveAIConfig()">Guardar Todo</button>
                </div>
            </div>
        `;
        
        this.showAssistantModal('Configuración IA', modalContent);
        
        // Actualizar valor de temperatura en tiempo real (con setTimeout para asegurar que el DOM esté listo)
        setTimeout(() => {
            const temperatureRange = document.getElementById('ai-temperature');
            const temperatureValue = document.querySelector('.range-value');
            if (temperatureRange && temperatureValue) {
                temperatureRange.addEventListener('input', (e) => {
                    temperatureValue.textContent = e.target.value;
                });
            }
        }, 100);
    }
    
    saveAIConfig() {
        const apiKey = document.getElementById('ai-api-key').value;
        const model = document.getElementById('ai-model').value;
        const maxTokens = parseInt(document.getElementById('ai-max-tokens').value);
        const temperature = parseFloat(document.getElementById('ai-temperature').value);
        const historyLimit = parseInt(document.getElementById('ai-history-limit').value);
        
        this.aiConfig = {
            apiKey,
            model,
            maxTokens,
            temperature,
            historyLimit
        };
        
        // Actualizar modelo actual en estadísticas
        const modelNames = {
            'gpt-5-nano': 'GPT-5 Nano',
            'gpt-5-mini': 'GPT-5 Mini',
            'gpt-5': 'GPT-5'
        };
        this.aiStats.currentModel = modelNames[model];
        
        this.saveAssistantData();
        this.hideModal();
        
        // Mostrar confirmación
        this.showNotification('Configuración guardada correctamente', 'success');
    }
    
    switchConfigTab(tabName) {
        // Cambiar tabs activos
        document.querySelectorAll('.config-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        
        // Cambiar contenido activo
        document.querySelectorAll('.config-tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `config-tab-${tabName}`);
        });
    }
    
    loadPromptForContext(contextId) {
        const promptInput = document.getElementById('system-prompt-input');
        if (!promptInput) return;
        
        if (this.promptContexts[contextId]) {
            promptInput.value = this.promptContexts[contextId].systemPrompt || '';
        } else {
            promptInput.value = '';
        }
    }
    
    savePromptForContext() {
        const contextSelect = document.getElementById('prompt-context-select');
        const promptInput = document.getElementById('system-prompt-input');
        
        if (!contextSelect || !promptInput) return;
        
        const contextId = contextSelect.value;
        const newPrompt = promptInput.value.trim();
        
        if (!newPrompt) {
            this.showNotification('El prompt no puede estar vacío', 'error');
            return;
        }
        
        // Actualizar el prompt en el contexto
        if (this.promptContexts[contextId]) {
            this.promptContexts[contextId].systemPrompt = newPrompt;
        }
        
        // Guardar en localStorage
        this.savePromptContexts();
        
        this.showNotification('Prompt guardado correctamente', 'success');
    }
    
    resetPromptToDefault() {
        const contextSelect = document.getElementById('prompt-context-select');
        const promptInput = document.getElementById('system-prompt-input');
        
        if (!contextSelect || !promptInput) return;
        
        const contextId = contextSelect.value;
        
        // Prompts por defecto
        const defaultPrompts = {
            general: 'Eres un asistente útil y amigable. Ayuda al usuario con cualquier consulta de manera clara y concisa.',
            tasks: 'Eres un asistente especializado en gestión de tareas y productividad. Ayuda al usuario a organizar, planificar y completar sus tareas de manera eficiente.'
        };
        
        if (defaultPrompts[contextId]) {
            promptInput.value = defaultPrompts[contextId];
            this.showNotification('Prompt restaurado por defecto', 'success');
        }
    }
    
    savePromptContexts() {
        try {
            localStorage.setItem('taskTreeAIPrompts', JSON.stringify(this.promptContexts));
        } catch (error) {
            console.error('Error guardando prompts:', error);
        }
    }
    
    showAIStatsModal() {
        const today = new Date().toDateString();
        if (this.aiStats.lastResetDate !== today) {
            this.aiStats.todayQueries = 0;
            this.aiStats.lastResetDate = today;
        }
        
        const modalContent = `
            <div class="ai-stats-modal">
                <h3>Estadísticas de Uso del Asistente IA</h3>
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-icon">🔢</div>
                        <div class="stat-content">
                            <div class="stat-number">${this.aiStats.todayQueries}</div>
                            <div class="stat-label">Consultas Hoy</div>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon">🎯</div>
                        <div class="stat-content">
                            <div class="stat-number">${this.aiStats.totalTokens.toLocaleString()}</div>
                            <div class="stat-label">Total Tokens</div>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon">💰</div>
                        <div class="stat-content">
                            <div class="stat-number">$${this.aiStats.estimatedCost.toFixed(4)}</div>
                            <div class="stat-label">Costo Estimado</div>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon">🤖</div>
                        <div class="stat-content">
                            <div class="stat-number">${this.aiStats.currentModel}</div>
                            <div class="stat-label">Modelo Actual</div>
                        </div>
                    </div>
                </div>
                
                <div class="pricing-info">
                    <h4>Precios por Modelo (por 1K tokens)</h4>
                    <div class="pricing-grid">
                        <div class="pricing-item">
                            <strong>GPT-5 Nano:</strong> $0.00005 (entrada) / $0.0004 (salida)
                        </div>
                        <div class="pricing-item">
                            <strong>GPT-5 Mini:</strong> $0.00025 (entrada) / $0.002 (salida)
                        </div>
                        <div class="pricing-item">
                            <strong>GPT-5:</strong> $0.00125 (entrada) / $0.01 (salida)
                        </div>
                    </div>
                </div>
                
                <div class="modal-actions">
                    <button type="button" class="btn-secondary" onclick="taskManager.exportAIStats()">Exportar</button>
                    <button type="button" class="btn-danger" onclick="taskManager.clearAIStats()">Limpiar</button>
                    <button type="button" class="btn-primary" onclick="taskManager.hideModal()">Cerrar</button>
                </div>
            </div>
        `;
        
        this.showAssistantModal('Estadísticas IA', modalContent);
    }
    
    showAssistantModal(title, content) {
        const modal = document.getElementById('modal');
        const modalTitle = document.getElementById('modal-title');
        const modalBody = document.getElementById('modal-body');
        
        if (!modal || !modalTitle || !modalBody) {
            console.error('Modal elements not found');
            return;
        }
        
        modalTitle.textContent = title;
        modalBody.innerHTML = content;
        modal.style.display = 'flex';
        
        // Hacer focus en el modal para accesibilidad
        modal.focus();
    }
    
    exportAIStats() {
        const statsData = {
            fecha: new Date().toISOString(),
            configuracion: this.aiConfig,
            estadisticas: this.aiStats,
            precios: this.modelPricing
        };
        
        const dataStr = JSON.stringify(statsData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `tasktree-ai-stats-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        URL.revokeObjectURL(url);
        this.showNotification('Estadísticas exportadas correctamente', 'success');
    }
    
    clearAIStats() {
        if (confirm('¿Estás seguro de que quieres limpiar todas las estadísticas? Esta acción no se puede deshacer.')) {
            this.aiStats = {
                todayQueries: 0,
                totalTokens: 0,
                estimatedCost: 0,
                usageHistory: [],
                currentModel: this.aiStats.currentModel,
                lastResetDate: new Date().toDateString()
            };
            
            this.saveAssistantData();
            this.hideModal();
            this.showNotification('Estadísticas limpiadas correctamente', 'success');
        }
    }
    
    updateAIStats(inputTokens, outputTokens) {
        const model = this.aiConfig.model;
        const pricing = this.modelPricing[model];
        
        if (pricing) {
            const inputCost = (inputTokens / 1000) * pricing.input;
            const outputCost = (outputTokens / 1000) * pricing.output;
            const totalCost = inputCost + outputCost;
            
            this.aiStats.todayQueries++;
            this.aiStats.totalTokens += inputTokens + outputTokens;
            this.aiStats.estimatedCost += totalCost;
            
            // Agregar al historial
            this.aiStats.usageHistory.push({
                fecha: new Date().toISOString(),
                modelo: model,
                tokensEntrada: inputTokens,
                tokensSalida: outputTokens,
                costo: totalCost
            });
            
            // Mantener solo los últimos 100 registros
            if (this.aiStats.usageHistory.length > 100) {
                this.aiStats.usageHistory = this.aiStats.usageHistory.slice(-100);
            }
            
            this.saveAssistantData();
        }
    }
    
    // ===== FUNCIONES CRUD ADICIONALES =====
    
    exportChatHistory() {
        const chatData = {
            fecha: new Date().toISOString(),
            modulo: this.currentModule,
            mensajes: this.mensajes,
            configuracion: {
                model: this.aiConfig.model,
                maxTokens: this.aiConfig.maxTokens,
                temperature: this.aiConfig.temperature
            },
            contexto: this.getSelectedContext()
        };
        
        const dataStr = JSON.stringify(chatData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `tasktree-chat-${this.currentModule}-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        URL.revokeObjectURL(url);
        this.showNotification('Historial de chat exportado', 'success');
    }
    
    clearChatHistory() {
        if (confirm('¿Estás seguro de que quieres borrar todo el historial del chat? Esta acción no se puede deshacer.')) {
            this.mensajes = [];
            this.renderChatMessages();
            this.saveAssistantData();
            this.showNotification('Historial de chat limpiado', 'success');
        }
    }
    
    importChatHistory() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const chatData = JSON.parse(e.target.result);
                    if (chatData.mensajes && Array.isArray(chatData.mensajes)) {
                        this.mensajes = [...this.mensajes, ...chatData.mensajes];
                        this.renderChatMessages();
                        this.saveAssistantData();
                        this.showNotification(`Importados ${chatData.mensajes.length} mensajes`, 'success');
                    } else {
                        this.showNotification('Formato de archivo inválido', 'error');
                    }
                } catch (error) {
                    this.showNotification('Error al importar el archivo', 'error');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }
    
    searchInChat(query) {
        if (!query.trim()) {
            this.renderChatMessages();
            return;
        }
        
        const filteredMessages = this.mensajes.filter(msg => 
            msg.content.toLowerCase().includes(query.toLowerCase())
        );
        
        const container = document.getElementById('chatMessages');
        if (!container) return;
        
        if (filteredMessages.length === 0) {
            container.innerHTML = `
                <div class="search-no-results">
                    <p>No se encontraron mensajes con "${query}"</p>
                    <button onclick="taskManager.renderChatMessages()" class="btn-secondary">Ver todos</button>
                </div>
            `;
        } else {
            container.innerHTML = filteredMessages.map((msg, index) => `
                <div class="message ${msg.role}">
                    <div class="message-content">${this.highlightSearchTerm(msg.content, query)}</div>
                    <div class="message-time">${new Date(msg.timestamp).toLocaleTimeString()}</div>
                </div>
            `).join('');
        }
        
        container.scrollTop = container.scrollHeight;
    }
    
    highlightSearchTerm(text, term) {
        const regex = new RegExp(`(${term})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }
    
    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            this.showNotification('Copiado al portapapeles', 'success');
        }).catch(() => {
            this.showNotification('Error al copiar', 'error');
        });
    }
    
    showNotification(message, type = 'info') {
        // Buscar si ya existe una función de notificación
        if (typeof this.showToast === 'function') {
            this.showToast(message, type);
        } else {
            // Fallback simple
            const notification = document.createElement('div');
            notification.className = `notification ${type}`;
            notification.textContent = message;
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 12px 20px;
                border-radius: 8px;
                color: white;
                font-weight: 500;
                z-index: 10000;
                opacity: 0;
                transition: opacity 0.3s ease;
            `;
            
            if (type === 'success') {
                notification.style.background = '#10b981';
            } else if (type === 'error') {
                notification.style.background = '#ef4444';
            } else {
                notification.style.background = '#3b82f6';
            }
            
            document.body.appendChild(notification);
            
            // Animar entrada
            setTimeout(() => notification.style.opacity = '1', 10);
            
            // Remover después de 3 segundos
            setTimeout(() => {
                notification.style.opacity = '0';
                setTimeout(() => notification.remove(), 300);
            }, 3000);
        }
    }
}

// === INICIALIZACIÓN ===
let taskManager;

document.addEventListener('DOMContentLoaded', () => {
    taskManager = new TaskManager();
});

// === FUNCIONES GLOBALES PARA COMPATIBILIDAD ===
function showAddScenarioForm() {
    taskManager.showItemForm('scenario');
}

function hideAddScenarioForm() {
    taskManager.hideItemForm();
}

function saveScenario() {
    taskManager.saveItem();
}

function showAddProjectForm() {
    taskManager.showItemForm('project');
}

function hideAddProjectForm() {
    taskManager.hideItemForm();
}

function saveProject() {
    taskManager.saveItem();
}

function hideScenarioModal() {
    taskManager.hideModal();
}

function hideProjectModal() {
    taskManager.hideModal();
}

function hideEditTaskModal() {
    taskManager.hideModal();
}