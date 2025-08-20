// TaskManager Class - Inicia Aqui
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
        this.currentProjectOnlyMode = false;

        
        this.data = this.initializeDefaultData();
        
        // Variables del asistente IA
        this.assistantVisible = false;
        this.mensajes = [];
        
        // Configuración de IA
        this.aiConfig = {
            apiKey: '',
            model: 'gpt-4.1-mini',
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
            'gpt-5': { input: 0.00125, output: 0.01 },
            'gpt-4.1-nano': { input: 0.0001, output: 0.0004, cacheReads: 0.00003 },
            'gpt-4.1-mini': { input: 0.0004, output: 0.0016, cacheReads: 0.0001 },
            'gpt-4.1': { input: 0.002, output: 0.008,cacheReads: 0.0005 }
        };
        
        // Configuración de prompts por contexto
        this.promptContexts = {
            general: {
                id: 'general',
                name: 'General',
                icon: '🤖',
                description: 'Asistente general para cualquier consulta',
                systemPrompt: 'Eres un asistente útil y amigable. Ayuda al usuario con cualquier consulta de manera clara y concisa.'
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

    // initializeDefaultData - Inicia Aqui
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
    // initializeDefaultData - Termina Aqui

    // init - Inicia Aqui
    init() {
        this.loadData();
        this.bindEvents();
        this.updateSelectors();
        this.render();
        this.updateFilterTags();
        this.initAssistant();
    }
    // init - Termina Aqui

    // bindEvents - Inicia Aqui
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
    // bindEvents - Termina Aqui

    // handleClick - Inicia Aqui
    handleClick(e) {
        // Manejar eventos del asistente
        if (e.target.id === 'toggleAssistant') {
            this.toggleAssistant();
            return;
        }

        // handleClick - Agregar manejo del checkbox
        // En la función handleClick, agregar después de los eventos del asistente:
        if (e.target.id === 'currentProjectOnly') {
            this.currentProjectOnlyMode = e.target.checked;
            this.saveAssistantData();
            
            // Mostrar notificación del cambio
            const mode = this.currentProjectOnlyMode ? 'Solo Proyecto Actual' : 'Todos los Datos';
            this.showNotification(`Modo cambiado a: ${mode}`, 'info');
            return;
        }
        
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
    // handleClick - Termina Aqui




    // handleChange - Inicia Aqui
    handleChange(e) {
        if (e.target.id === 'scenarioSelect') {
            this.currentScenario = parseInt(e.target.value);
            this.currentProject = this.getFirstProjectId();
            this.updateSelectors();
            this.render();
        } else if (e.target.id === 'projectSelect') {
            this.currentProject = parseInt(e.target.value);
            this.render();
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
    // handleChange - Termina Aqui

    // handleSubmit - Inicia Aqui
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
    // handleSubmit - Termina Aqui

    // handleKeydown - Inicia Aqui
handleKeydown(e) {
    // Manejar Enter en el chat del asistente con soporte para múltiples líneas
    if (e.target.id === 'chatInput') {
        if (e.key === 'Enter') {
            if (e.shiftKey) {
                // Shift+Enter: permitir salto de línea y redimensionar inmediatamente
                // No preventDefault() para permitir el salto de línea
                setTimeout(() => {
                    this.autoResizeChatInput(e.target);
                }, 0);
                return;
            } else {
                // Enter solo: enviar mensaje
                e.preventDefault();
                this.sendMessage();
                return;
            }
        }
        
        // También redimensionar en otras teclas que puedan cambiar el contenido
        if (e.key === 'Backspace' || e.key === 'Delete') {
            setTimeout(() => {
                this.autoResizeChatInput(e.target);
            }, 0);
        }
        
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
// handleKeydown - Termina Aqui

    // autoResizeChatInput - Inicia Aqui
    autoResizeChatInput(textarea) {
        // Resetear altura para calcular correctamente
        textarea.style.height = 'auto';
        
        // Calcular nueva altura basada en el contenido
        const maxHeight = 120; // Máximo 120px (aproximadamente 4-5 líneas)
        const newHeight = Math.min(textarea.scrollHeight, maxHeight);
        
        // Aplicar nueva altura
        textarea.style.height = newHeight + 'px';
        
        // Si excede el máximo, mostrar scrollbar
        if (textarea.scrollHeight > maxHeight) {
            textarea.style.overflowY = 'auto';
        } else {
            textarea.style.overflowY = 'hidden';
        }
    }
    // autoResizeChatInput - Termina Aqui

    // handleSelectionChange - Inicia Aqui
    handleSelectionChange() {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return;
        
        const activeElement = document.activeElement;
        if (activeElement && activeElement.classList.contains('markdown-editor-content')) {
            this.updateButtonStates(activeElement);
        }
    }
    // handleSelectionChange - Termina Aqui

    // handleInput - Inicia Aqui
    handleInput(e) {
        // Eliminado: ya no hay conversión automática de URLs
    }
    // handleInput - Termina Aqui

    // handleBlur - Inicia Aqui
    handleBlur(e) {
        // Eliminado: ya no hay conversión automática de URLs
    }
    // handleBlur - Termina Aqui

    // handleMarkdownShortcuts - Inicia Aqui
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
    // handleMarkdownShortcuts - Termina Aqui

    // applyHtmlFormat - Inicia Aqui
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
    // applyHtmlFormat - Termina Aqui

    // wrapSelectionWithElement - Inicia Aqui
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
    // wrapSelectionWithElement - Termina Aqui

    // updateButtonStates - Inicia Aqui
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
    // updateButtonStates - Termina Aqui

    // isSelectionInElement - Inicia Aqui
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
    // isSelectionInElement - Termina Aqui

    // createLinkFromSelection - Inicia Aqui
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
    // createLinkFromSelection - Termina Aqui

    // getTaskId - Inicia Aqui
    getTaskId(element) {
        const taskItem = element.closest('.task-item');
        return taskItem ? parseInt(taskItem.dataset.taskId) : null;
    }
    // getTaskId - Termina Aqui

    // getDataIndex - Inicia Aqui
    getDataIndex(element) {
        return parseInt(element.dataset.idx);
    }
    // getDataIndex - Termina Aqui

    // getFirstProjectId - Inicia Aqui
    getFirstProjectId() {
        return parseInt(Object.keys(this.data[this.currentScenario]?.projects || {})[0]) || 1;
    }
    // getFirstProjectId - Termina Aqui

    // getCurrentTasks - Inicia Aqui
    getCurrentTasks() {
        return this.data[this.currentScenario]?.projects[this.currentProject]?.tasks || [];
    }
    // getCurrentTasks - Termina Aqui

    // getAllTasks - Inicia Aqui
    getAllTasks(tasks = null) {
        const searchTasks = tasks || this.getCurrentTasks();
        const result = searchTasks.reduce((all, task) => {
            all.push(task);
            all.push(...this.getAllTasks(task.children));
            return all;
        }, []);
        return result;
    }
    // getAllTasks - Termina Aqui

    // findTaskById - Inicia Aqui
    findTaskById(taskId, tasks = null) {
        const searchTasks = tasks || this.getCurrentTasks();
        
        for (let task of searchTasks) {
            if (task.id === taskId) return task;
            const found = this.findTaskById(taskId, task.children);
            if (found) return found;
        }
        return null;
    }
    // findTaskById - Termina Aqui

    // generateUniqueId - Inicia Aqui
    generateUniqueId() {
        return this.taskIdCounter++;
    }
    // generateUniqueId - Termina Aqui

    // addTask - Inicia Aqui
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
    // addTask - Termina Aqui

    // calculateDepth - Inicia Aqui
    calculateDepth(parentId) {
        if (!parentId) return 0;
        const parent = this.findTaskById(parentId);
        return parent ? parent.depth + 1 : 0;
    }
    // calculateDepth - Termina Aqui

    // toggleTaskCompletion - Inicia Aqui
    toggleTaskCompletion(taskId) {
        const task = this.findTaskById(taskId);
        if (task) {
            task.completed = !task.completed;
            this.updateChildrenCompletion(task, task.completed);
            this.saveAndRender();
        }
    }
    // toggleTaskCompletion - Termina Aqui

    // updateChildrenCompletion - Inicia Aqui
    updateChildrenCompletion(task, completed) {
        task.children.forEach(child => {
            child.completed = completed;
            this.updateChildrenCompletion(child, completed);
        });
    }
    // updateChildrenCompletion - Termina Aqui

    // toggleTaskExpansion - Inicia Aqui
    toggleTaskExpansion(taskId) {
        const task = this.findTaskById(taskId);
        if (task?.children.length > 0) {
            task.expanded = !task.expanded;
            this.saveAndRender();
        }
    }
    // toggleTaskExpansion - Termina Aqui

    // duplicateTask - Inicia Aqui
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
    // duplicateTask - Termina Aqui

    // createTaskCopy - Inicia Aqui
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
    // createTaskCopy - Termina Aqui

    // copyChildren - Inicia Aqui
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
    // copyChildren - Termina Aqui

    // updateChildrenParentIds - Inicia Aqui
    updateChildrenParentIds(children, newParentId) {
        children.forEach(child => {
            child.parentId = newParentId;
            if (child.children.length > 0) {
                this.updateChildrenParentIds(child.children, child.id);
            }
        });
    }
    // updateChildrenParentIds - Termina Aqui

    // deleteTask - Inicia Aqui
    deleteTask(taskId) {
        if (confirm('¿Estás seguro de que quieres eliminar esta tarea y todas sus subtareas?')) {
            this.removeTaskById(taskId);
            this.saveAndRender();
        }
    }
    // deleteTask - Termina Aqui

    // removeTaskById - Inicia Aqui
    removeTaskById(taskId) {
        const currentTasks = this.getCurrentTasks();
        this.data[this.currentScenario].projects[this.currentProject].tasks = 
            this.filterTasks(currentTasks, taskId);
    }
    // removeTaskById - Termina Aqui

    // filterTasks - Inicia Aqui
    filterTasks(tasks, excludeId) {
        return tasks.filter(task => {
            if (task.id === excludeId) return false;
            task.children = this.filterTasks(task.children, excludeId);
            return true;
        });
    }
    // filterTasks - Termina Aqui

    // addEmptySubtask - Inicia Aqui
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
    // addEmptySubtask - Termina Aqui

    // showSubtaskForm - Inicia Aqui
    showSubtaskForm(parentId) {
        const form = document.querySelector(`[data-parent="${parentId}"]`);
        if (form) {
            form.classList.add('show');
            form.querySelector('.subtask-input').focus();
        }
    }
    // showSubtaskForm - Termina Aqui

    // addSubtaskFromForm - Inicia Aqui
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
    // addSubtaskFromForm - Termina Aqui

    // hideSubtaskForm - Inicia Aqui
    hideSubtaskForm(button) {
        const form = button.closest('.subtask-form');
        if (form) {
            form.classList.remove('show');
            form.querySelector('.subtask-input').value = '';
        }
    }
    // hideSubtaskForm - Termina Aqui

    // initializeDragAndDrop - Inicia Aqui
    initializeDragAndDrop() {
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
    // initializeDragAndDrop - Termina Aqui

    // cleanupDragAndDrop - Inicia Aqui
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
    // cleanupDragAndDrop - Termina Aqui

    // handleDragStart - Inicia Aqui
    handleDragStart(e) {
        e.preventDefault();
        
        const taskItem = e.target.closest('.task-item');
        if (!taskItem) return;
        
        const taskId = parseInt(taskItem.dataset.taskId);
        const task = this.findTaskById(taskId);
        
        if (!task) return;
        
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
    // handleDragStart - Termina Aqui

    // createDragPreview - Inicia Aqui
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
    // createDragPreview - Termina Aqui

    // createDynamicDropZones - Inicia Aqui
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
    // createDynamicDropZones - Termina Aqui

    // createTaskDropZone - Inicia Aqui
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
    // createTaskDropZone - Termina Aqui

    // safeInsertBefore - Inicia Aqui
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
            try {
                if (parent && newNode && document.contains(parent)) {
                    parent.appendChild(newNode);
                    return true;
                }
            } catch (appendError) {
                // Error también en appendChild
            }
            return false;
        }
    }
    // safeInsertBefore - Termina Aqui

    // createReorderDropZones - Inicia Aqui
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
    // createReorderDropZones - Termina Aqui

    // findLastElementOfTask - Inicia Aqui
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
    // findLastElementOfTask - Termina Aqui

    // createReorderDropZone - Inicia Aqui
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
    // createReorderDropZone - Termina Aqui

    // activateDropZone - Inicia Aqui
    activateDropZone(dropZone) {
        dropZone.classList.add('active');
        dropZone.style.display = 'block';
        dropZone.style.opacity = '1';
    }
    // activateDropZone - Termina Aqui

    // handleDragMove - Inicia Aqui
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
    // handleDragMove - Termina Aqui

    // handleAutoScroll - Inicia Aqui
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
    // handleAutoScroll - Termina Aqui

    // handleDragEnd - Inicia Aqui
    handleDragEnd(e) {
        if (!this.draggingTask) return;
        
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
    // handleDragEnd - Termina Aqui

    // handleDrop - Inicia Aqui
    handleDrop(dropZone) {
        const dropType = dropZone.dataset.dropType;
        const task = this.draggingTask;
        
        if (dropType === 'subtask') {
            const newParentId = parseInt(dropZone.dataset.taskId);
            if (newParentId && newParentId !== task.id) {
                this.convertToSubtask(task.id, newParentId);
            }
        } else if (dropType === 'reorder') {
            const referenceId = parseInt(dropZone.dataset.referenceId);
            const position = dropZone.dataset.position;
            this.reorderTask(task.id, referenceId, position);
        }
    }
    // handleDrop - Termina Aqui

    // reorderTask - Inicia Aqui
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
    // reorderTask - Termina Aqui

    // convertToSubtask - Inicia Aqui
    convertToSubtask(taskId, newParentId) {
        const task = this.findTaskById(taskId);
        const newParent = this.findTaskById(newParentId);
        
        if (!task || !newParent || task.id === newParentId) {
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
    // convertToSubtask - Termina Aqui

    // isDescendant - Inicia Aqui
    isDescendant(potentialDescendant, ancestor) {
        if (!ancestor.children) return false;
        
        for (const child of ancestor.children) {
            if (child.id === potentialDescendant.id) return true;
            if (this.isDescendant(potentialDescendant, child)) return true;
        }
        
        return false;
    }
    // isDescendant - Termina Aqui

    // cleanupDragState - Inicia Aqui
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
    // cleanupDragState - Termina Aqui

    // removeTaskFromParent - Inicia Aqui
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
    // removeTaskFromParent - Termina Aqui

    // updateTaskHierarchy - Inicia Aqui
    updateTaskHierarchy(task, newParentId) {
        task.parentId = newParentId;
        task.depth = this.calculateDepth(newParentId);
        
        // Actualizar profundidad de todos los hijos recursivamente
        this.updateChildrenDepth(task);
    }
    // updateTaskHierarchy - Termina Aqui

    // updateChildrenDepth - Inicia Aqui
    updateChildrenDepth(task) {
        task.children.forEach(child => {
            child.depth = task.depth + 1;
            child.parentId = task.id;
            this.updateChildrenDepth(child);
        });
    }
    // updateChildrenDepth - Termina Aqui

    // render - Inicia Aqui
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
    // render - Termina Aqui

    // renderTasks - Inicia Aqui
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
    // renderTasks - Termina Aqui

    // getFilteredTasksHierarchical - Inicia Aqui
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
    // getFilteredTasksHierarchical - Termina Aqui

    // renderTasksHTML - Inicia Aqui
    renderTasksHTML(tasks) {
        return tasks.map(task => this.renderTaskHTML(task)).join('');
    }
    // renderTasksHTML - Termina Aqui

    // renderTaskHTML - Inicia Aqui
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
    // renderTaskHTML - Termina Aqui

    // generateTaskBadges - Inicia Aqui
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
    // generateTaskBadges - Termina Aqui

    // getPriorityBadge - Inicia Aqui
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
    // getPriorityBadge - Termina Aqui

    // getDateBadges - Inicia Aqui
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
    // getDateBadges - Termina Aqui

    // updateStats - Inicia Aqui
    updateStats() {
        const allTasks = this.getAllTasks();
        const completed = allTasks.filter(task => task.completed);
        const pending = allTasks.filter(task => !task.completed);

        document.getElementById('totalTasks').textContent = allTasks.length;
        document.getElementById('completedTasks').textContent = completed.length;
        document.getElementById('pendingTasks').textContent = pending.length;
    }
    // updateStats - Termina Aqui

    // showModal - Inicia Aqui
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
    // showModal - Termina Aqui

    // hideModal - Inicia Aqui
    hideModal() {
        document.getElementById('modal').style.display = 'none';
        this.editingItemId = null;
    }
    // hideModal - Termina Aqui

    // getItemModalContent - Inicia Aqui
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
    // getItemModalContent - Termina Aqui

    // renderItemsList - Inicia Aqui
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
    // renderItemsList - Termina Aqui

    // showItemForm - Inicia Aqui
    showItemForm(type) {
        const form = document.getElementById('itemForm');
        const title = document.getElementById('form-title');
        const singular = type === 'scenario' ? 'Escenario' : 'Proyecto';
        
        title.textContent = this.editingItemId ? `Editar ${singular}` : `Nuevo ${singular}`;
        form.style.display = 'block';
        document.getElementById('item-name').focus();
    }
    // showItemForm - Termina Aqui

    // hideItemForm - Inicia Aqui
    hideItemForm() {
        const form = document.getElementById('itemForm');
        form.style.display = 'none';
        this.editingItemId = null;
        this.clearItemForm();
    }
    // hideItemForm - Termina Aqui

    // clearItemForm - Inicia Aqui
    clearItemForm() {
        ['item-name', 'item-icon', 'item-description'].forEach(id => {
            document.getElementById(id).value = '';
        });
    }
    // clearItemForm - Termina Aqui

    // editItem - Inicia Aqui
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
    // editItem - Termina Aqui

    // fillItemForm - Inicia Aqui
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
    // fillItemForm - Termina Aqui

    // saveItem - Inicia Aqui
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
    // saveItem - Termina Aqui

    // updateExistingItem - Inicia Aqui
    updateExistingItem(type, data) {
        if (type === 'scenario') {
            Object.assign(this.data[this.editingItemId], data);
        } else {
            Object.assign(this.data[this.currentScenario].projects[this.editingItemId], data);
        }
    }
    // updateExistingItem - Termina Aqui

    // createNewItem - Inicia Aqui
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
    // createNewItem - Termina Aqui

    // deleteItem - Inicia Aqui
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
    // deleteItem - Termina Aqui

    // exportItem - Inicia Aqui
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
    }
    // exportItem - Termina Aqui

    // importItem - Inicia Aqui
    importItem(type) {
        const fileInput = document.getElementById('importFileInput');
        fileInput.click();
    }
    // importItem - Termina Aqui

    // handleImportFile - Inicia Aqui
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
            }
        };
        reader.readAsText(file);
        
        // Limpiar el input para permitir importar el mismo archivo nuevamente
        event.target.value = '';
    }
    // handleImportFile - Termina Aqui

    // processImportedData - Inicia Aqui
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
    // processImportedData - Termina Aqui

    // deleteScenario - Inicia Aqui
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
    // deleteScenario - Termina Aqui

    // deleteProject - Inicia Aqui
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
    // deleteProject - Termina Aqui

    // updateSelectors - Inicia Aqui
    updateSelectors() {
        this.updateScenarioSelect();
        this.updateProjectSelect();
    }
    // updateSelectors - Termina Aqui

    // updateScenarioSelect - Inicia Aqui
    updateScenarioSelect() {
        const select = document.getElementById('scenarioSelect');
        select.innerHTML = Object.values(this.data).map(scenario => 
            `<option value="${scenario.id}" ${scenario.id === this.currentScenario ? 'selected' : ''}>${scenario.icon} ${scenario.name}</option>`
        ).join('');
    }
    // updateScenarioSelect - Termina Aqui

    // updateProjectSelect - Inicia Aqui
    updateProjectSelect() {
        const select = document.getElementById('projectSelect');
        const projects = this.data[this.currentScenario]?.projects || {};
        select.innerHTML = Object.values(projects).map(project => 
            `<option value="${project.id}" ${project.id === this.currentProject ? 'selected' : ''}>${project.icon} ${project.name}</option>`
        ).join('');
    }
    // updateProjectSelect - Termina Aqui

    // findParentTask - Inicia Aqui
    findParentTask(targetTask) {
        const allTasks = this.getCurrentTasks();
        return this.findParentInTasks(targetTask, allTasks);
    }
    // findParentTask - Termina Aqui

    // findParentInTasks - Inicia Aqui
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
    // findParentInTasks - Termina Aqui

    // showEditTaskModal - Inicia Aqui
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
    // showEditTaskModal - Termina Aqui

    // getEditTaskModalContent - Inicia Aqui
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
    // getEditTaskModalContent - Termina Aqui

    // populateEditForm - Inicia Aqui
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
    // populateEditForm - Termina Aqui

    // handleEditTaskSubmit - Inicia Aqui
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
    // handleEditTaskSubmit - Termina Aqui

    // getEditFormData - Inicia Aqui
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
    // getEditFormData - Termina Aqui

    // updateTaskWithFormData - Inicia Aqui
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
    // updateTaskWithFormData - Termina Aqui

    // createTaskForRepetition - Inicia Aqui
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
    // createTaskForRepetition - Termina Aqui

    // duplicateChildrenForRepetition - Inicia Aqui
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
    // duplicateChildrenForRepetition - Termina Aqui

    // addTagFromInput - Inicia Aqui
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
    // addTagFromInput - Termina Aqui

    // renderEditingTags - Inicia Aqui
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
    // renderEditingTags - Termina Aqui

    // removeEditingTag - Inicia Aqui
    removeEditingTag(tag) {
        this.editingTags = this.editingTags.filter(t => (typeof t === 'string' ? t : t.text) !== tag);
        this.renderEditingTags();
    }
    // removeEditingTag - Termina Aqui

    // getAllExistingTags - Inicia Aqui
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
    // getAllExistingTags - Termina Aqui

    // showTagSuggestions - Inicia Aqui
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
    // showTagSuggestions - Termina Aqui

    // selectTagSuggestion - Inicia Aqui
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
    // selectTagSuggestion - Termina Aqui

    // hideTagSuggestions - Inicia Aqui
    hideTagSuggestions() {
        const suggestionsElement = document.getElementById('editTagsSuggestions');
        if (!suggestionsElement) return;
        
        setTimeout(() => {
            suggestionsElement.classList.remove('show');
        }, 200);
    }
    // hideTagSuggestions - Termina Aqui

    // setupTagSuggestionListeners - Inicia Aqui
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
    // setupTagSuggestionListeners - Termina Aqui

    // setQuickDate - Inicia Aqui
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
    // setQuickDate - Termina Aqui

    // setQuickAlert - Inicia Aqui
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
    // setQuickAlert - Termina Aqui

    // getDaysRemainingBadge - Inicia Aqui
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
    // getDaysRemainingBadge - Termina Aqui

    // getTimeRemainingInfo - Inicia Aqui
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
    // getTimeRemainingInfo - Termina Aqui

    // calculateDaysRemaining - Inicia Aqui
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
    // calculateDaysRemaining - Termina Aqui

    // getDueDateInfo - Inicia Aqui
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
    // getDueDateInfo - Termina Aqui

    // createRepeatedTasks - Inicia Aqui
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
    // createRepeatedTasks - Termina Aqui

    // adjustChildrenParentIds - Inicia Aqui
    adjustChildrenParentIds(children, newParentId) {
        children.forEach(child => {
            child.parentId = newParentId;
            if (child.children && child.children.length > 0) {
                this.adjustChildrenParentIds(child.children, child.id);
            }
        });
    }
    // adjustChildrenParentIds - Termina Aqui

    // saveData - Inicia Aqui
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
            // Error al guardar datos
        }
    }
    // saveData - Termina Aqui

    // loadData - Inicia Aqui
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
            // Error al cargar datos
        }
    }
    // loadData - Termina Aqui

    // rescheduleAllAlerts - Inicia Aqui
    rescheduleAllAlerts() {
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
    }
    // rescheduleAllAlerts - Termina Aqui
    
    // rescheduleTaskAlerts - Inicia Aqui
    rescheduleTaskAlerts(tasks) {
        tasks.forEach(task => {
            // Reprogramar alertas de esta tarea
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
            
            // Reprogramar alertas de subtareas recursivamente
            if (task.children && task.children.length > 0) {
                this.rescheduleTaskAlerts(task.children);
            }
        });
    }
    // rescheduleTaskAlerts - Termina Aqui

    // applyFilter - Inicia Aqui
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
    // applyFilter - Termina Aqui

    // toggleSort - Inicia Aqui
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
    // toggleSort - Termina Aqui

    // toggleAllTasks - Inicia Aqui
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
    // toggleAllTasks - Termina Aqui

    // getAllTasksWithChildren - Inicia Aqui
    getAllTasksWithChildren() {
        const allTasks = this.getAllTasks();
        return allTasks.filter(task => task.children && task.children.length > 0);
    }
    // getAllTasksWithChildren - Termina Aqui

    // updateExpandCollapseControlVisibility - Inicia Aqui
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
    // updateExpandCollapseControlVisibility - Termina Aqui

    // updateExpandCollapseButtonText - Inicia Aqui
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
    // updateExpandCollapseButtonText - Termina Aqui

    // detectActualCollapseState - Inicia Aqui
    detectActualCollapseState() {
        const tasksWithChildren = this.getAllTasksWithChildren();
        if (tasksWithChildren.length === 0) return false;
        
        // Si todas las tareas con hijos están contraídas, retorna true
        const allCollapsed = tasksWithChildren.every(task => !task.expanded);
        return allCollapsed;
    }
    // detectActualCollapseState - Termina Aqui

    // toggleTaskSelection - Inicia Aqui
    toggleTaskSelection(taskId) {
        if (this.selectedTasks.has(taskId)) {
            this.selectedTasks.delete(taskId);
        } else {
            this.selectedTasks.add(taskId);
            this.lastSelectedTaskId = taskId;
        }
        this.updateMultiSelectUI();
    }
    // toggleTaskSelection - Termina Aqui

    // selectTaskRange - Inicia Aqui
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
    // selectTaskRange - Termina Aqui

    // getVisibleTasksInOrder - Inicia Aqui
    getVisibleTasksInOrder() {
        if (this.currentFilter === 'all') {
            return this.getAllTasks();
        } else {
            return this.getFilteredTasks();
        }
    }
    // getVisibleTasksInOrder - Termina Aqui

    // clearSelection - Inicia Aqui
    clearSelection() {
        this.selectedTasks.clear();
        this.lastSelectedTaskId = null;
        this.updateMultiSelectUI();
    }
    // clearSelection - Termina Aqui

    // updateMultiSelectUI - Inicia Aqui
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
    // updateMultiSelectUI - Termina Aqui

    // updateTaskSelectionStyles - Inicia Aqui
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
    // updateTaskSelectionStyles - Termina Aqui

    // bulkComplete - Inicia Aqui
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
    // bulkComplete - Termina Aqui

    // bulkDuplicate - Inicia Aqui
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
    // bulkDuplicate - Termina Aqui

    // bulkDelete - Inicia Aqui
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
    // bulkDelete - Termina Aqui

    // startInlineEdit - Inicia Aqui
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
    // startInlineEdit - Termina Aqui
    
    // handleInlineEditKeydown - Inicia Aqui
    handleInlineEditKeydown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.endInlineEdit(true);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            this.endInlineEdit(false);
        }
    }
    // handleInlineEditKeydown - Termina Aqui
    
    // endInlineEdit - Inicia Aqui
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
    
    // Verificar que el input aún esté conectado al DOM antes de removerlo
    if (input && input.parentNode && document.contains(input)) {
        try {
            input.remove();
        } catch (error) {
            // Si falla el remove, intentar con removeChild
            try {
                input.parentNode.removeChild(input);
            } catch (removeError) {
                // Si también falla removeChild, continuar sin remover
            }
        }
    }
    
    // Restaurar el texto de la tarea
    if (taskText) {
        taskText.style.display = '';
        taskText.classList.remove('editing');
    }
    
    this.currentlyEditingTaskId = null;
    
    // Re-renderizar solo si se guardó un cambio
    if (save && input.value && input.value.trim() && input.value.trim() !== input.dataset.originalText) {
        this.render();
    }
}
// endInlineEdit - Termina Aqui

    // toggleTagFilter - Inicia Aqui
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
    // toggleTagFilter - Termina Aqui

    // updateFilterTags - Inicia Aqui
    updateFilterTags() {
        const filterTagsContainer = document.getElementById('filterTags');
        if (!filterTagsContainer) return;

        // Obtener todas las etiquetas únicas
        const allTags = new Set();
        this.getAllTasks().forEach(task => {
            if (task.tags) {
                task.tags.forEach(tag => {
                    const tagText = typeof tag === 'string' ? tag : tag.text;
                    allTags.add(tagText);
                });
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
    // updateFilterTags - Termina Aqui

    // getFilteredTasks - Inicia Aqui
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
                return Array.from(this.activeTagFilters).some(filterTag => {
                    return task.tags.some(taskTag => {
                        const taskTagText = typeof taskTag === 'string' ? taskTag : taskTag.text;
                        return taskTagText === filterTag;
                    });
                });
            });
        }

        // Aplicar ordenamiento
        if (this.activeSortingFilters.size > 0) {
            tasks = this.sortTasks(tasks, this.activeSortingFilters);
        }

        return tasks;
    }
    // getFilteredTasks - Termina Aqui

    // sortTasks - Inicia Aqui
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
    // sortTasks - Termina Aqui

    // saveAndRender - Inicia Aqui
    saveAndRender() {
        this.saveData();
        this.render();
    }
    // saveAndRender - Termina Aqui

    // escapeHtml - Inicia Aqui
    escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    // escapeHtml - Termina Aqui

    // getElementValue - Inicia Aqui
    getElementValue(id) {
        const element = document.getElementById(id);
        if (!element) return '';
        
        // Para elementos contenteditable, usar innerHTML
        if (element.contentEditable === 'true') {
            return element.innerHTML;
        }
        
        return element.value || '';
    }
    // getElementValue - Termina Aqui

    // setElementValue - Inicia Aqui
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
    // setElementValue - Termina Aqui

    // addAlert - Inicia Aqui
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
    // addAlert - Termina Aqui

    // addAlertToList - Inicia Aqui
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
    // addAlertToList - Termina Aqui

    // removeAlert - Inicia Aqui
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
    // removeAlert - Termina Aqui

    // editAlert - Inicia Aqui
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
    // editAlert - Termina Aqui

    // toggleAlert - Inicia Aqui
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
    // toggleAlert - Termina Aqui

    // duplicateAlert - Inicia Aqui
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
    // duplicateAlert - Termina Aqui

    // updateAlertInList - Inicia Aqui
    updateAlertInList(alertObj) {
        const alertElement = document.querySelector(`[data-alert-id="${alertObj.id}"]`);
        if (!alertElement) return;
        
        // Remover elemento actual y agregar actualizado
        alertElement.remove();
        this.addAlertToList(alertObj);
    }
    // updateAlertInList - Termina Aqui

    // scheduleAlert - Inicia Aqui
    scheduleAlert(alertObj) {
        if (!this.alertTimeouts) {
            this.alertTimeouts = {};
        }
        
        // Cancelar timeout existente si ya existe para esta alerta
        if (this.alertTimeouts[alertObj.id]) {
            clearTimeout(this.alertTimeouts[alertObj.id]);
            delete this.alertTimeouts[alertObj.id];
        }
        
        const alertDate = new Date(alertObj.alertDate);
        const now = new Date();
        const timeUntilAlert = alertDate.getTime() - now.getTime();
        
        if (timeUntilAlert <= 0) {
            return;
        }
        
        this.alertTimeouts[alertObj.id] = setTimeout(() => {
            this.triggerAlert(alertObj);
            delete this.alertTimeouts[alertObj.id];
        }, timeUntilAlert);
        
        // Actualizar countdown cada segundo
        this.updateCountdown(alertObj.id, alertDate);
    }
    // scheduleAlert - Termina Aqui

    // triggerAlert - Inicia Aqui
    async triggerAlert(alertObj) {
        try {
            // Verificar permisos de notificación
            let permission = Notification.permission;
            if (permission === 'default') {
                permission = await Notification.requestPermission();
            }
            
            if (permission === 'denied') {
                // Mostrar alerta en página como fallback
                alert(`🔔 ${alertObj.title}: ${alertObj.message}`);
                return;
            }
            
            // Usar service worker para notificaciones push si está disponible
            if (this.swRegistration) {
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
                
                return; // Evitar mostrar notificación duplicada
                
            } else {
                // Fallback a notificación simple
                new Notification(alertObj.title, {
                    body: alertObj.message,
                    icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="red" stroke-width="2"%3E%3Ccircle cx="12" cy="12" r="10"%3E%3C/circle%3E%3Cpolyline points="12,6 12,12 16,14"%3E%3C/polyline%3E%3C/svg%3E'
                });
            }
            
        } catch (error) {
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
    // triggerAlert - Termina Aqui

    // sendWebhook - Inicia Aqui
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
            // Webhook enviado
        }).catch(error => {
            // Error enviando webhook
        });
    }
    // sendWebhook - Termina Aqui

    // getTimeRemaining - Inicia Aqui
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
    // getTimeRemaining - Termina Aqui

    // loadTaskAlerts - Inicia Aqui
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
    // loadTaskAlerts - Termina Aqui

    // updateCountdown - Inicia Aqui
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
    // updateCountdown - Termina Aqui

    // startTimeBadgeUpdater - Inicia Aqui
    startTimeBadgeUpdater() {
        // Actualizar badges cada minuto
        this.timeBadgeInterval = setInterval(() => {
            this.updateTimeBadges();
        }, 60000); // 60 segundos
    }
    // startTimeBadgeUpdater - Termina Aqui
    
    // updateTimeBadges - Inicia Aqui
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
    }
    // updateTimeBadges - Termina Aqui
    
    // destroy - Inicia Aqui
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
    // destroy - Termina Aqui

    // registerServiceWorker - Inicia Aqui
    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                // Limpiar service workers anteriores
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (let registration of registrations) {
                    await registration.unregister();
                }
                
                // Registrar nuevo service worker
                const registration = await navigator.serviceWorker.register('/sw.js', {
                    scope: './'
                });
                
                await navigator.serviceWorker.ready;
                
                this.swRegistration = registration;
                
            } catch (error) {
                // Error registrando service worker
            }
        }
    }
    // registerServiceWorker - Termina Aqui

    // initAssistant - Inicia Aqui
    initAssistant() {
        this.loadAssistantData();
        this.setupAssistantEventListeners();
    }
    // initAssistant - Termina Aqui
    
// setupChatInputListeners - Inicia Aqui
setupChatInputListeners() {
    const chatInput = document.getElementById('chatInput');
    if (!chatInput) return;
    
    // Event listener para redimensionar en tiempo real
    chatInput.addEventListener('input', (e) => {
        this.autoResizeChatInput(e.target);
    });
    
    // Event listener para paste (pegar texto)
    chatInput.addEventListener('paste', (e) => {
        // Permitir que se pegue el contenido primero
        setTimeout(() => {
            this.autoResizeChatInput(e.target);
        }, 0);
    });
    
    // Event listener para cuando se carga la página (si hay contenido previo)
    chatInput.addEventListener('focus', (e) => {
        if (e.target.value) {
            this.autoResizeChatInput(e.target);
        }
    });
}
// setupChatInputListeners - Termina Aqui

// Llamar esta función en initAssistant()
// initAssistant - Inicia Aqui
initAssistant() {
    this.loadAssistantData();
    this.setupAssistantEventListeners();
    this.setupChatInputListeners(); // <- AGREGAR ESTA LÍNEA
}
// initAssistant - Termina Aqui

    // loadAssistantData - Inicia Aqui
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
        
        // Cargar estado del checkbox "Solo Proyecto Actual"
        const savedProjectMode = localStorage.getItem('taskTreeCurrentProjectOnly');
        if (savedProjectMode !== null) {
            this.currentProjectOnlyMode = JSON.parse(savedProjectMode);
            // Actualizar el checkbox en la UI
            setTimeout(() => {
                const checkbox = document.getElementById('currentProjectOnly');
                if (checkbox) {
                    checkbox.checked = this.currentProjectOnlyMode;
                }
            }, 100);
        }
    } catch (error) {
        // Error cargando datos del asistente
    }
}
// loadAssistantData - Termina Aqui
    
    // setupAssistantEventListeners - Inicia Aqui
    setupAssistantEventListeners() {
        // Los eventos ya están manejados en handleClick y handleKeydown
    }
    // setupAssistantEventListeners - Termina Aqui
    
    // toggleAssistant - Inicia Aqui
    toggleAssistant() {
        this.assistantVisible = !this.assistantVisible;
        const content = document.getElementById('assistantContent');
        const toggleBtn = document.getElementById('toggleAssistant');
        
        if (this.assistantVisible) {
            content.style.display = 'block';
            toggleBtn.textContent = 'Ocultar';
        } else {
            content.style.display = 'none';
            toggleBtn.textContent = 'Mostrar';
        }
    }
    // toggleAssistant - Termina Aqui
    
    // sendMessage - Inicia Aqui
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
        
        // Limpiar input y resetear altura
        input.value = '';
        input.style.height = 'auto';
        input.style.overflowY = 'hidden';
        
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
    // sendMessage - Termina Aqui
    
    // callAIAPI - Inicia Aqui
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
        
        // Configurar tokens y temperatura según el modelo
        if (this.aiConfig.model.startsWith('gpt-4.1')) {
            // GPT-4.1 series: usar max_completion_tokens y temperature flexible
            requestBody.max_completion_tokens = this.aiConfig.maxTokens;
            requestBody.temperature = this.aiConfig.temperature;
        } else if (this.aiConfig.model.startsWith('gpt-5')) {
            // GPT-5 series: usar configuración específica
            requestBody.max_completion_tokens = this.aiConfig.maxTokens;
            requestBody.temperature = 1; // GPT-5 solo soporta temperature = 1
        } else {
            // Otros modelos: usar configuración estándar
            requestBody.max_tokens = this.aiConfig.maxTokens;
            requestBody.temperature = this.aiConfig.temperature;
        }

        // Agregar función genérica para manipular datos
        requestBody.functions = this.getDataManipulationFunctions();

        const startTime = Date.now();
        
        // Usar OpenAI API para todos los modelos
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
                
                // Configurar tokens según el modelo
                if (this.aiConfig.model.startsWith('gpt-4.1')) {
                    finalRequestBody.max_completion_tokens = Math.min(this.aiConfig.maxTokens, 200);
                    finalRequestBody.temperature = this.aiConfig.temperature;
                } else if (this.aiConfig.model.startsWith('gpt-5')) {
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
    // callAIAPI - Termina Aqui

    // getDataManipulationFunctions - Inicia Aqui
getDataManipulationFunctions() {
    return [
        {
            name: 'manipularDatos',
            description: 'Función para manipular datos del sistema de tareas. La IA debe RAZONAR y generar contenido específico para cada proyecto, no usar plantillas.',
            parameters: {
                type: 'object',
                properties: {
                    operacion: {
                        type: 'string',
                        enum: ['obtener', 'agregar', 'editar', 'eliminar', 'marcar_completada', 'marcar_pendiente', 'crear_estructura_completa'],
                        description: 'Operación a realizar. Usa "crear_estructura_completa" para generar un proyecto completo.'
                    },
                    tipo: {
                        type: 'string',
                        enum: ['tasks', 'projects', 'scenarios', 'estructura_completa'],
                        description: 'Tipo de datos a manipular'
                    },
                    tema: {
                        type: 'string',
                        description: 'Descripción del proyecto para el cual la IA debe RAZONAR y crear contenido específico'
                    },
                    datos: {
                        type: 'array',
                        description: 'Array con elementos generados por la IA basados en el análisis del proyecto. La IA debe crear contenido inteligente y específico.',
                        items: {
                            type: 'object',
                            properties: {
                                tipo: { type: 'string', enum: ['escenario', 'proyecto', 'tarea'], description: 'Tipo de elemento' },
                                title: { type: 'string', description: 'Nombre generado por la IA' },
                                description: { type: 'string', description: 'Descripción detallada' },
                                icon: { type: 'string', description: 'Emoji apropiado' },
                                priority: { type: 'string', enum: ['alta', 'media', 'baja'] },
                                dueDate: { type: 'string', description: 'Fecha ISO' },
                                tags: { type: 'array', items: { type: 'string' } },
                                subtasks: {
                                    type: 'array',
                                    description: 'Subtareas específicas generadas por la IA',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            title: { type: 'string' },
                                            description: { type: 'string' },
                                            priority: { type: 'string', enum: ['alta', 'media', 'baja'] },
                                            tags: { type: 'array', items: { type: 'string' } }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                required: ['operacion', 'tipo']
            }
        }
    ];
}
// getDataManipulationFunctions - Termina Aqui

    // manipularDatos - Inicia Aqui
async manipularDatos(args, context) {
    const { operacion, tipo, datos = [], escenario, tema, contexto_previo } = args;
    
    try {
        // DETECTAR EL MODO ACTUAL
        const isCurrentProjectOnly = this.currentProjectOnlyMode;
        let targetScenario, targetProject;
        
        if (isCurrentProjectOnly) {
            // En modo "Solo Proyecto Actual", usar siempre el proyecto actual
            targetScenario = this.currentScenario;
            targetProject = this.currentProject;
        } else {
            // En modo completo, usar el contexto proporcionado o el actual
            targetScenario = contexto_previo?.ultimo_escenario_id || this.currentScenario;
            targetProject = contexto_previo?.ultimo_proyecto_id || this.currentProject;
        }
        
        // NUEVA FUNCIONALIDAD: Crear estructura completa demostrativa - CON IA
        if (tipo === 'estructura_completa' || operacion === 'crear_estructura_completa') {
            if (isCurrentProjectOnly) {
                // En modo proyecto actual, crear las tareas directamente en el proyecto actual
                if (!datos || datos.length === 0) {
                    return `❌ No se proporcionaron datos para crear las tareas en "${this.data[targetScenario]?.projects[targetProject]?.name}".`;
                }
                
                let results = [];
                
                // Solo procesar tareas (ignorar escenarios y proyectos en este modo)
                for (const item of datos) {
                    if (item.tipo === 'tarea') {
                        const taskId = this.generateUniqueId();
                        const newTask = {
                            id: taskId,
                            text: item.title,
                            completed: false,
                            parentId: null,
                            children: [],
                            expanded: true,
                            depth: 0,
                            priority: item.priority || 'media',
                            description: item.description || '',
                            dueDate: item.dueDate || this.generateDemoDate(),
                            repeat: null,
                            repeatCount: null,
                            tags: item.tags || []
                        };
                        
                        // Agregar subtareas si existen
                        if (item.subtasks) {
                            for (const subtaskData of item.subtasks) {
                                const subtaskId = this.generateUniqueId();
                                const newSubtask = {
                                    id: subtaskId,
                                    text: subtaskData.title,
                                    completed: false,
                                    parentId: taskId,
                                    children: [],
                                    expanded: true,
                                    depth: 1,
                                    priority: subtaskData.priority || 'media',
                                    description: subtaskData.description || '',
                                    dueDate: subtaskData.dueDate || this.generateDemoDate(1, 7),
                                    repeat: null,
                                    repeatCount: null,
                                    tags: subtaskData.tags || []
                                };
                                newTask.children.push(newSubtask);
                            }
                        }
                        
                        // Agregar al proyecto actual
                        this.data[targetScenario].projects[targetProject].tasks.push(newTask);
                        results.push(`📝 Tarea creada en proyecto actual: "${item.title}" (ID: ${taskId}) con ${newTask.children.length} subtareas`);
                    }
                }
                
                this.saveAndRender();
                return `✅ **Tareas creadas en "${this.data[targetScenario]?.projects[targetProject]?.name}":**\n\n${results.join('\n')}\n\n*Las tareas han sido agregadas al proyecto actual.*`;
                
            } else {
                // Modo completo: comportamiento original (crear escenarios, proyectos y tareas)
                if (!datos || datos.length === 0) {
                    return `❌ No se proporcionaron datos para crear la estructura. La IA debe generar el contenido específico para "${tema}".`;
                }
                
                let results = [];
                let createdScenario = null;
                let createdProject = null;
                
                // Procesar cada elemento según su tipo
                for (const item of datos) {
                    if (item.tipo === 'escenario') {
                        const scenarioId = this.scenarioIdCounter++;
                        const newScenario = {
                            id: scenarioId,
                            name: item.title,
                            icon: item.icon || '📁',
                            description: item.description || '',
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
                        
                        this.data[scenarioId] = newScenario;
                        createdScenario = newScenario;
                        results.push(`📁 Escenario creado: "${item.title}" (ID: ${scenarioId})`);
                    }
                    
                    if (item.tipo === 'proyecto') {
                        const projectId = this.projectIdCounter++;
                        const newProject = {
                            id: projectId,
                            name: item.title,
                            icon: item.icon || '📋',
                            description: item.description || '',
                            tasks: []
                        };
                        
                        const targetScenarioForProject = createdScenario || this.data[this.currentScenario];
                        targetScenarioForProject.projects[projectId] = newProject;
                        createdProject = newProject;
                        results.push(`📋 Proyecto creado: "${item.title}" (ID: ${projectId})`);
                    }
                    
                    if (item.tipo === 'tarea') {
                        const taskId = this.generateUniqueId();
                        const newTask = {
                            id: taskId,
                            text: item.title,
                            completed: false,
                            parentId: null,
                            children: [],
                            expanded: true,
                            depth: 0,
                            priority: item.priority || 'media',
                            description: item.description || '',
                            dueDate: item.dueDate || this.generateDemoDate(),
                            repeat: null,
                            repeatCount: null,
                            tags: item.tags || []
                        };
                        
                        // Agregar subtareas si existen
                        if (item.subtasks) {
                            for (const subtaskData of item.subtasks) {
                                const subtaskId = this.generateUniqueId();
                                const newSubtask = {
                                    id: subtaskId,
                                    text: subtaskData.title,
                                    completed: false,
                                    parentId: taskId,
                                    children: [],
                                    expanded: true,
                                    depth: 1,
                                    priority: subtaskData.priority || 'media',
                                    description: subtaskData.description || '',
                                    dueDate: subtaskData.dueDate || this.generateDemoDate(1, 7),
                                    repeat: null,
                                    repeatCount: null,
                                    tags: subtaskData.tags || []
                                };
                                newTask.children.push(newSubtask);
                            }
                        }
                        
                        const targetProjectForTask = createdProject || this.data[this.currentScenario].projects[this.currentProject];
                        targetProjectForTask.tasks.push(newTask);
                        results.push(`📝 Tarea creada: "${item.title}" (ID: ${taskId}) con ${newTask.children.length} subtareas`);
                    }
                }
                
                this.saveAndRender();
                this.updateSelectors();
                
                return `✅ **Estructura inteligente creada:**\n\n${results.join('\n')}\n\n*Los elementos han sido creados y están disponibles en la interfaz.*`;
            }
        }
        
        // Para Tasks, usar directamente los métodos del TaskManager
        if (tipo === 'tasks') {
            switch(operacion) {
                case 'agregar':
                    let results = [];
                    for (const tarea of datos) {
                        const parentId = tarea.parentId || null;
                        
                        // Usar el contexto determinado al inicio
                        const finalTargetScenario = tarea.scenarioId || targetScenario;
                        const finalTargetProject = tarea.projectId || targetProject;
                        
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
                        
                        // Crear subtareas si se especifican
                        if (tarea.subtasks && Array.isArray(tarea.subtasks)) {
                            for (const subtaskData of tarea.subtasks) {
                                const subtaskId = this.generateUniqueId();
                                const newSubtask = {
                                    id: subtaskId,
                                    text: subtaskData.title,
                                    completed: false,
                                    parentId: taskId,
                                    children: [],
                                    expanded: true,
                                    depth: newTask.depth + 1,
                                    priority: subtaskData.priority || 'media',
                                    description: subtaskData.description || '',
                                    dueDate: subtaskData.dueDate || null,
                                    repeat: null,
                                    repeatCount: null,
                                    tags: subtaskData.tags || []
                                };
                                newTask.children.push(newSubtask);
                            }
                        }
                        
                        // Agregar la tarea al escenario y proyecto especificados
                        if (parentId) {
                            let parent;
                            if (isCurrentProjectOnly) {
                                // Buscar solo en el proyecto actual
                                parent = this.findTaskById(parentId, this.data[targetScenario].projects[targetProject].tasks);
                            } else {
                                // Buscar en todos los escenarios
                                parent = this.findTaskByIdInAllScenarios(parentId);
                            }
                            
                            if (parent) {
                                parent.children.push(newTask);
                                parent.expanded = true;
                            } else {
                                results.push(`❌ Tarea padre con ID ${parentId} no encontrada${isCurrentProjectOnly ? ' en el proyecto actual' : ''}`);
                                continue;
                            }
                        } else {
                            // Asegurar que el escenario y proyecto existan
                            if (!this.data[finalTargetScenario]) {
                                results.push(`❌ Escenario ${finalTargetScenario} no encontrado`);
                                continue;
                            }
                            if (!this.data[finalTargetScenario].projects[finalTargetProject]) {
                                results.push(`❌ Proyecto ${finalTargetProject} no encontrado en escenario ${finalTargetScenario}`);
                                continue;
                            }
                            this.data[finalTargetScenario].projects[finalTargetProject].tasks.push(newTask);
                        }
                        
                        const taskType = parentId ? 'Subtarea' : 'Tarea';
                        const parentInfo = parentId ? ` (subtarea de ID: ${parentId})` : '';
                        
                        let contextInfo = '';
                        if (!isCurrentProjectOnly) {
                            contextInfo = ` (Escenario: ${this.data[finalTargetScenario]?.name || finalTargetScenario}, Proyecto: ${this.data[finalTargetScenario]?.projects[finalTargetProject]?.name || finalTargetProject})`;
                        }
                        
                        const subtasksInfo = newTask.children.length > 0 ? ` con ${newTask.children.length} subtareas` : '';
                        const propsInfo = [];
                        if (tarea.priority) propsInfo.push(`prioridad: ${tarea.priority}`);
                        if (tarea.dueDate) propsInfo.push(`fecha: ${tarea.dueDate}`);
                        if (tarea.tags?.length) propsInfo.push(`etiquetas: ${tarea.tags.join(', ')}`);
                        const additionalInfo = propsInfo.length ? ` (${propsInfo.join(', ')})` : '';
                        
                        results.push(`✅ ${taskType} agregada: "${tarea.title}" (ID: ${newTask.id})${parentInfo}${contextInfo}${subtasksInfo}${additionalInfo}`);
                    }
                    // Guardar y renderizar una sola vez al final
                    this.saveAndRender();
                    return results.join('\n');
                
                case 'editar':
                    let editResults = [];
                    for (const tarea of datos) {
                        if (tarea.id) {
                            let task;
                            if (isCurrentProjectOnly) {
                                // Buscar solo en el proyecto actual
                                task = this.findTaskById(tarea.id, this.data[targetScenario].projects[targetProject].tasks);
                            } else {
                                // Buscar en todos los escenarios
                                task = this.findTaskByIdInAllScenarios(tarea.id);
                            }
                            
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
                                editResults.push(`❌ No se encontró la tarea con ID: ${tarea.id}${isCurrentProjectOnly ? ' en el proyecto actual' : ''}`);
                            }
                        }
                    }
                    this.saveAndRender();
                    return editResults.join('\n');
                
                case 'eliminar':
                    let deleteResults = [];
                    for (const tarea of datos) {
                        if (tarea.id) {
                            let task;
                            if (isCurrentProjectOnly) {
                                // Buscar y eliminar solo en el proyecto actual
                                task = this.findTaskById(tarea.id, this.data[targetScenario].projects[targetProject].tasks);
                                if (task) {
                                    this.data[targetScenario].projects[targetProject].tasks = 
                                        this.filterTasks(this.data[targetScenario].projects[targetProject].tasks, tarea.id);
                                }
                            } else {
                                // Buscar y eliminar en todos los escenarios
                                task = this.findTaskByIdInAllScenarios(tarea.id);
                                if (task) {
                                    this.removeTaskByIdFromAllScenarios(tarea.id);
                                }
                            }
                            
                            if (task) {
                                deleteResults.push(`✅ Tarea eliminada: "${task.text}" (ID: ${tarea.id})`);
                            } else {
                                deleteResults.push(`❌ No se encontró la tarea con ID: ${tarea.id}${isCurrentProjectOnly ? ' en el proyecto actual' : ''}`);
                            }
                        }
                    }
                    this.saveAndRender();
                    return deleteResults.join('\n');
                
                case 'marcar_completada':
                case 'marcar_pendiente':
                    let toggleResults = [];
                    const completed = operacion === 'marcar_completada';
                    for (const tarea of datos) {
                        if (tarea.id) {
                            let task;
                            if (isCurrentProjectOnly) {
                                // Buscar solo en el proyecto actual
                                task = this.findTaskById(tarea.id, this.data[targetScenario].projects[targetProject].tasks);
                            } else {
                                // Buscar en todos los escenarios
                                task = this.findTaskByIdInAllScenarios(tarea.id);
                            }
                            
                            if (task) {
                                task.completed = completed;
                                toggleResults.push(`✅ Tarea ${completed ? 'completada' : 'marcada como pendiente'}: "${task.text}" (ID: ${task.id})`);
                            } else {
                                toggleResults.push(`❌ No se encontró la tarea con ID: ${tarea.id}${isCurrentProjectOnly ? ' en el proyecto actual' : ''}`);
                            }
                        }
                    }
                    this.saveAndRender();
                    return toggleResults.join('\n');
                
                case 'obtener':
                    if (isCurrentProjectOnly) {
                        // Obtener solo las tareas del proyecto actual
                        const currentScenarioData = this.data[targetScenario];
                        const currentProjectData = currentScenarioData?.projects[targetProject];
                        const tasks = currentProjectData?.tasks || [];
                        
                        let tasksText = `\n📁 ESCENARIO ACTUAL: ${currentScenarioData?.name}\n`;
                        tasksText += `  📋 PROYECTO ACTUAL: ${currentProjectData?.name}: ${tasks.length} tareas\n`;
                        
                        tasks.forEach(task => {
                            tasksText += `    • ID: ${task.id} - ${task.text} ${task.completed ? '✅' : '⏳'}\n`;
                            if (task.children && task.children.length > 0) {
                                task.children.forEach(subtask => {
                                    tasksText += `      ↳ ID: ${subtask.id} - ${subtask.text} ${subtask.completed ? '✅' : '⏳'}\n`;
                                });
                            }
                        });
                        
                        return `📊 TAREAS DEL PROYECTO ACTUAL:${tasksText}`;
                    } else {
                        // Obtener TODAS las tareas de TODOS los escenarios y proyectos
                        let allTasksText = '';
                        Object.values(this.data).forEach(scenario => {
                            allTasksText += `\n📁 ESCENARIO: ${scenario.name}\n`;
                            if (scenario.projects) {
                                Object.values(scenario.projects).forEach(project => {
                                    const tasks = project.tasks || [];
                                    allTasksText += `  📋 ${project.name}: ${tasks.length} tareas\n`;
                                    tasks.forEach(task => {
                                        allTasksText += `    • ID: ${task.id} - ${task.text} ${task.completed ? '✅' : '⏳'}\n`;
                                        if (task.children && task.children.length > 0) {
                                            task.children.forEach(subtask => {
                                                allTasksText += `      ↳ ID: ${subtask.id} - ${subtask.text} ${subtask.completed ? '✅' : '⏳'}\n`;
                                            });
                                        }
                                    });
                                });
                            }
                        });
                        
                        return `📊 RESUMEN COMPLETO DE TAREAS:${allTasksText}`;
                    }
                
                default:
                    return `❌ Operación "${operacion}" no reconocida para tareas`;
            }
        }
        
        // Para proyectos
        if (tipo === 'projects') {
            if (isCurrentProjectOnly) {
                return `❌ En modo "Solo Proyecto Actual" no se pueden crear nuevos proyectos. Cambia al modo completo para esta operación.`;
            }
            
            switch(operacion) {
                case 'agregar':
                    let projectResults = [];
                    for (const proyecto of datos) {
                        const finalTargetScenario = proyecto.scenarioId || targetScenario;
                        const newProject = {
                            id: this.projectIdCounter++,
                            name: proyecto.title,
                            description: proyecto.description || '',
                            icon: proyecto.icon || '📁',
                            tasks: []
                        };
                        // Agregar al escenario especificado
                        if (!this.data[finalTargetScenario]) {
                            projectResults.push(`❌ Escenario ${finalTargetScenario} no encontrado`);
                            continue;
                        }
                        this.data[finalTargetScenario].projects[newProject.id] = newProject;
                        projectResults.push(`✅ Proyecto agregado: "${proyecto.title}" (ID: ${newProject.id}) en escenario "${this.data[finalTargetScenario].name}"`);
                    }
                    this.saveData();
                    this.updateSelectors();
                    this.render();
                    return projectResults.join('\n');
                
                case 'obtener':
                    let allProjectsText = '';
                    Object.values(this.data).forEach(scenario => {
                        allProjectsText += `\n📁 ESCENARIO: ${scenario.name}\n`;
                        if (scenario.projects) {
                            Object.values(scenario.projects).forEach(project => {
                                allProjectsText += `  📋 ID: ${project.id} - ${project.name}\n`;
                            });
                        }
                    });
                    return `📂 TODOS LOS PROYECTOS:${allProjectsText}`;
                
                default:
                    return `❌ Operación "${operacion}" no soportada para proyectos`;
            }
        }
        
        // Para escenarios
        if (tipo === 'scenarios') {
            if (isCurrentProjectOnly) {
                return `❌ En modo "Solo Proyecto Actual" no se pueden crear nuevos escenarios. Cambia al modo completo para esta operación.`;
            }
            
            switch(operacion) {
                case 'agregar':
                    let scenarioResults = [];
                    for (const escenario of datos) {
                        const newScenario = {
                            id: this.scenarioIdCounter++,
                            name: escenario.title,
                            description: escenario.description || '',
                            icon: escenario.icon || '📁',
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
                        this.data[newScenario.id] = newScenario;
                        scenarioResults.push(`✅ Escenario agregado: "${escenario.title}" (ID: ${newScenario.id})`);
                    }
                    this.saveData();
                    this.updateSelectors();
                    this.render();
                    return scenarioResults.join('\n');
                
                case 'obtener':
                    let allScenariosText = '';
                    Object.values(this.data).forEach(scenario => {
                        allScenariosText += `📁 ID: ${scenario.id} - ${scenario.name}\n`;
                    });
                    return `📂 TODOS LOS ESCENARIOS:\n${allScenariosText}`;
                
                default:
                    return `❌ Operación "${operacion}" no soportada para escenarios`;
            }
        }
        
        return `❌ Tipo de datos "${tipo}" no soportado actualmente`;
        
    } catch (error) {
        return `❌ Error ejecutando operación: ${error.message}`;
    }
}
// manipularDatos - Termina Aqui

// generateDemoDate - Inicia Aqui
generateDemoDate(minDays = 1, maxDays = 14) {
    const now = new Date();
    const randomDays = Math.floor(Math.random() * (maxDays - minDays + 1)) + minDays;
    const futureDate = new Date(now.getTime() + (randomDays * 24 * 60 * 60 * 1000));
    
    return futureDate.toISOString().split('T')[0]; // Formato YYYY-MM-DD
}
// generateDemoDate - Termina Aqui

// findTaskByIdInAllScenarios - Inicia Aqui
findTaskByIdInAllScenarios(taskId) {
    // Buscar en todos los escenarios y proyectos
    for (const scenario of Object.values(this.data)) {
        if (scenario.projects) {
            for (const project of Object.values(scenario.projects)) {
                if (project.tasks) {
                    const found = this.findTaskById(taskId, project.tasks);
                    if (found) return found;
                }
            }
        }
    }
    return null;
}
// findTaskByIdInAllScenarios - Termina Aqui

// removeTaskByIdFromAllScenarios - Inicia Aqui
removeTaskByIdFromAllScenarios(taskId) {
    // Buscar y eliminar en todos los escenarios y proyectos
    for (const scenario of Object.values(this.data)) {
        if (scenario.projects) {
            for (const project of Object.values(scenario.projects)) {
                if (project.tasks) {
                    project.tasks = this.filterTasks(project.tasks, taskId);
                }
            }
        }
    }
}
// removeTaskByIdFromAllScenarios - Termina Aqui

    // buildSystemPrompt - Inicia Aqui
buildSystemPrompt(context) {
    // Obtener el prompt base del contexto general
    const basePrompt = this.promptContexts.general.systemPrompt;
    
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
    
// AQUÍ ES DONDE REALMENTE LIMITAMOS EL JSON QUE SE ENVÍA
    let dataToSend;
    
    if (context.mode === 'current_project_only') {
        // MODO: Solo proyecto actual - ENVIAR SOLO ESTE JSON (AHORRO DE TOKENS)
        systemPrompt += `CONTEXTO ESPECÍFICO - SOLO PROYECTO ACTUAL:\n`;
        systemPrompt += `Trabajando ÚNICAMENTE en el proyecto actual:\n`;
        systemPrompt += `- Escenario: ${context.scenario?.name || 'Sin nombre'} (ID: ${context.scenario?.id})\n`;
        systemPrompt += `- Proyecto: ${context.project?.name || 'Sin nombre'} (ID: ${context.project?.id})\n`;
        systemPrompt += `- Descripción: ${context.project?.description || 'Sin descripción'}\n\n`;
        
        // SOLO enviar el JSON del proyecto actual (minimizando tokens)
        dataToSend = {
            currentScenario: {
                id: context.scenario?.id,
                name: context.scenario?.name,
                icon: context.scenario?.icon,
                description: context.scenario?.description
            },
            currentProject: {
                id: context.project?.id,
                name: context.project?.name,
                icon: context.project?.icon,
                description: context.project?.description,
                tasks: context.tasks || []
            },
            mode: 'current_project_only'
        };
        
        systemPrompt += `DATOS DISPONIBLES (SOLO PROYECTO ACTUAL):\n`;
        systemPrompt += `${JSON.stringify(dataToSend, null, 2)}\n\n`;
        
        systemPrompt += `**CAPACIDADES LIMITADAS:**\n`;
        systemPrompt += `- Solo puedes trabajar con las tareas de este proyecto específico\n`;
        systemPrompt += `- No tienes acceso a otros escenarios o proyectos\n`;
        systemPrompt += `- Todas las operaciones se limitan al contexto actual\n`;
        systemPrompt += `- Al crear nuevas tareas, van automáticamente a este proyecto\n`;
        systemPrompt += `- IDs de contexto: Escenario ${context.scenario?.id}, Proyecto ${context.project?.id}\n\n`;
        
    } else {

    // MODO GENERAL: Acceso completo a toda la base de datos
    systemPrompt += `BASE DE DATOS COMPLETA:\n`;
    systemPrompt += `Tienes acceso completo a toda la información del usuario:\n`;
    systemPrompt += `- Todos los escenarios y sus proyectos\n`;
    systemPrompt += `- Todas las tareas de todos los contextos\n`;
    systemPrompt += `- Puedes consultar, crear, editar y eliminar elementos en cualquier contexto\n\n`;
    
    // CAPACIDADES DE RAZONAMIENTO INTELIGENTE
    systemPrompt += `RAZONAMIENTO INTELIGENTE PARA PROYECTOS:\n`;
    systemPrompt += `**ANALIZA EL PROYECTO SOLICITADO:**\n`;
    systemPrompt += `- Entiende QUÉ tipo de proyecto es (CRM, e-commerce, app móvil, etc.)\n`;
    systemPrompt += `- Identifica las FASES lógicas del desarrollo\n`;
    systemPrompt += `- Piensa en los COMPONENTES técnicos necesarios\n`;
    systemPrompt += `- Considera las INTEGRACIONES que necesitará\n`;
    systemPrompt += `- Define las TAREAS específicas que hacen sentido para ESE proyecto\n\n`;
    
    systemPrompt += `**CREA ESTRUCTURAS INTELIGENTES:**\n`;
    systemPrompt += `- Escenario: Describe el DOMINIO del proyecto (ej: "CRM y Automatización", "E-commerce", "Fintech")\n`;
    systemPrompt += `- Proyecto: El PRODUCTO específico que se está construyendo\n`;
    systemPrompt += `- Tareas: FASES reales del desarrollo (Backend, Frontend, Integraciones, Testing, Deploy)\n`;
    systemPrompt += `- Subtareas: ACCIONES específicas dentro de cada fase\n\n`;
    
    systemPrompt += `**EJEMPLOS DE RAZONAMIENTO:**\n`;
    systemPrompt += `Si piden "CRM para WhatsApp":\n`;
    systemPrompt += `- Escenario: "CRM y Automatización de Ventas"\n`;
    systemPrompt += `- Proyecto: "CRM WhatsApp Business"\n`;
    systemPrompt += `- Tareas: "Integración WhatsApp API", "Dashboard de Conversaciones", "Automatización de Respuestas", "Analytics y Reportes"\n`;
    systemPrompt += `- Subtareas para API: "Configurar Webhook", "Autenticación Business API", "Manejo de mensajes entrantes"\n\n`;
    
    systemPrompt += `Si piden "E-commerce con pagos":\n`;
    systemPrompt += `- Escenario: "Plataforma de E-commerce"\n`;
    systemPrompt += `- Proyecto: "Tienda Online con Pagos"\n`;
    systemPrompt += `- Tareas: "Catálogo de Productos", "Carrito de Compras", "Sistema de Pagos", "Gestión de Pedidos"\n`;
    systemPrompt += `- Subtareas para Pagos: "Integrar Stripe", "Configurar PayPal", "Validación de tarjetas"\n\n`;
    
    systemPrompt += `**MANTÉN CONTEXTO:**\n`;
    systemPrompt += `- Recuerda el proyecto del que estamos hablando\n`;
    systemPrompt += `- Si piden "agregar más tareas" refírete al mismo proyecto\n`;
    systemPrompt += `- Si piden "crear subtareas" agrégalas a las tareas existentes\n`;
    systemPrompt += `- Siempre mantén coherencia temática\n\n`;
    
    systemPrompt += `**FORMATO DE FECHAS**: SIEMPRE usa formato ISO (YYYY-MM-DD). Para "mañana" usa ${tomorrow}, para "hoy" usa ${today}\n\n`;
    
    systemPrompt += `DATOS DISPONIBLES:\n`;
    systemPrompt += `${JSON.stringify(this.data, null, 2)}\n\n`;
    
    systemPrompt += `**INSTRUCCIONES ESPECÍFICAS:**\n`;
    systemPrompt += `1. NO uses plantillas predefinidas - RAZONA cada proyecto\n`;
    systemPrompt += `2. ANALIZA lo que el usuario realmente necesita\n`;
    systemPrompt += `3. CREA contenido que tenga sentido para ESE proyecto específico\n`;
    systemPrompt += `4. PIENSA como un arquitecto de software experimentado\n`;
    systemPrompt += `5. GENERA tareas que realmente se harían en ese tipo de proyecto\n\n`;
    
    systemPrompt += `Responde siempre con razonamiento inteligente y contenido útil para el proyecto específico solicitado.`;
    }
    return systemPrompt;
}
// buildSystemPrompt - Termina Aqui
    
    // getSelectedContext - Inicia Aqui
getSelectedContext() {
    if (this.currentProjectOnlyMode) {
        // Modo: Solo proyecto actual
        const currentScenario = this.data[this.currentScenario];
        const currentProject = currentScenario?.projects[this.currentProject];
        
        const context = {
            scenario: currentScenario,
            project: currentProject,
            tasks: currentProject?.tasks || [],
            mode: 'current_project_only'
        };
        
        return context;
    } else {
        // Modo: Toda la base de datos (comportamiento original)
        const context = {
            scenarios: Object.values(this.data),
            projects: [],
            allData: this.data,
            mode: 'all_data'
        };
        
        // Agregar todos los proyectos de todos los escenarios
        Object.values(this.data).forEach(scenario => {
            if (scenario.projects) {
                context.projects.push(...Object.values(scenario.projects));
            }
        });
        
        return context;
    }
}
// getSelectedContext - Termina Aqui
    
    // renderChatMessages - Inicia Aqui
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
    // renderChatMessages - Termina Aqui
    
    // saveAssistantData - Inicia Aqui
saveAssistantData() {
    try {
        localStorage.setItem('taskTreeAIConfig', JSON.stringify(this.aiConfig));
        localStorage.setItem('taskTreeAIStats', JSON.stringify(this.aiStats));
        localStorage.setItem('taskTreeAIMessages', JSON.stringify(this.mensajes));
        localStorage.setItem('taskTreeCurrentProjectOnly', JSON.stringify(this.currentProjectOnlyMode));
        this.savePromptContexts();
    } catch (error) {
        // Error guardando datos del asistente
    }
}
// saveAssistantData - Termina Aqui
    
    // showAIConfigModal - Inicia Aqui
    showAIConfigModal() {
    const modalContent = `
        <div class="ai-config-modal">
            <h3>Configuración del Asistente IA</h3>
            
            <div class="config-section">
                <label for="ai-api-key">API Key:</label>
                <input type="password" id="ai-api-key" value="${this.aiConfig.apiKey}" 
                       placeholder="Introduce tu API Key">
            </div>
            
            <div class="config-section">
                <label for="ai-model">Modelo:</label>
                <select id="ai-model">
                    <optgroup label="GPT-4.1 Series (Recomendado)">
                        <option value="gpt-4.1-nano" ${this.aiConfig.model === 'gpt-4.1-nano' ? 'selected' : ''}>
                            GPT-4.1 Nano ($0.10/$0.40 por 1M tokens) - 1M context
                        </option>
                        <option value="gpt-4.1-mini" ${this.aiConfig.model === 'gpt-4.1-mini' ? 'selected' : ''}>
                            GPT-4.1 Mini ($0.40/$1.60 por 1M tokens) - 1M context
                        </option>
                        <option value="gpt-4.1" ${this.aiConfig.model === 'gpt-4.1' ? 'selected' : ''}>
                            GPT-4.1 ($2.00/$8.00 por 1M tokens) - 1M context
                        </option>
                    </optgroup>
                    <optgroup label="GPT-5 Series (Legacy)">
                        <option value="gpt-5-nano" ${this.aiConfig.model === 'gpt-5-nano' ? 'selected' : ''}>
                            GPT-5 Nano ($0.05/$0.40 por 1K tokens)
                        </option>
                        <option value="gpt-5-mini" ${this.aiConfig.model === 'gpt-5-mini' ? 'selected' : ''}>
                            GPT-5 Mini ($0.25/$2.00 por 1K tokens)
                        </option>
                        <option value="gpt-5" ${this.aiConfig.model === 'gpt-5' ? 'selected' : ''}>
                            GPT-5 ($1.25/$10.00 por 1K tokens)
                        </option>
                    </optgroup>
                </select>
                <small class="help-text">Los modelos GPT-4.1 tienen ventana de contexto de 1M tokens y mejor eficiencia.</small>
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
            
            <div class="config-section">
                <label for="system-prompt-input">System Prompt:</label>
                <textarea id="system-prompt-input" rows="6" 
                          placeholder="Escribe el prompt del sistema...">${this.promptContexts.general.systemPrompt}</textarea>
                <small class="help-text">Este prompt define cómo se comportará el asistente.</small>
            </div>
            
            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick="taskManager.hideModal()">Cancelar</button>
                <button type="button" class="btn-primary" onclick="taskManager.saveAIConfig()">Guardar</button>
            </div>
        </div>
    `;
    
    this.showAssistantModal('Configuración IA', modalContent);
    
    // Actualizar valor de temperatura en tiempo real
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
    // showAIConfigModal - Termina Aqui
    
    // saveAIConfig - Inicia Aqui
        saveAIConfig() {
        const apiKey = document.getElementById('ai-api-key').value;
        const model = document.getElementById('ai-model').value;
        const maxTokens = parseInt(document.getElementById('ai-max-tokens').value);
        const temperature = parseFloat(document.getElementById('ai-temperature').value);
        const historyLimit = parseInt(document.getElementById('ai-history-limit').value);
        const systemPrompt = document.getElementById('system-prompt-input').value.trim();
        
        this.aiConfig = {
            apiKey,
            model,
            maxTokens,
            temperature,
            historyLimit
        };
        
        // Actualizar system prompt
        if (systemPrompt) {
            this.promptContexts.general.systemPrompt = systemPrompt;
        }
        
        // Actualizar modelo actual en estadísticas
        const modelNames = {
            // GPT-4.1 Series
            'gpt-4.1-nano': 'GPT-4.1 Nano',
            'gpt-4.1-mini': 'GPT-4.1 Mini',
            'gpt-4.1': 'GPT-4.1',
            // GPT-5 Series (Legacy)
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
    // saveAIConfig - Termina Aqui
    
    // showAIStatsModal - Inicia Aqui
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
                    <h4>Precios por Modelo</h4>
                    <div class="pricing-grid">
                        <div class="pricing-section">
                            <h5>GPT-4.1 Series (Recomendado)</h5>
                            <div class="pricing-item">
                                <strong>GPT-4.1 Nano:</strong> $0.10/$0.40 por 1M tokens (1M context)
                            </div>
                            <div class="pricing-item">
                                <strong>GPT-4.1 Mini:</strong> $0.40/$1.60 por 1M tokens (1M context)
                            </div>
                            <div class="pricing-item">
                                <strong>GPT-4.1:</strong> $2.00/$8.00 por 1M tokens (1M context)
                            </div>
                        </div>
                        <div class="pricing-section">
                            <h5>GPT-5 Series (Legacy)</h5>
                            <div class="pricing-item">
                                <strong>GPT-5 Nano:</strong> $0.05/$0.40 por 1K tokens
                            </div>
                            <div class="pricing-item">
                                <strong>GPT-5 Mini:</strong> $0.25/$2.00 por 1K tokens
                            </div>
                            <div class="pricing-item">
                                <strong>GPT-5:</strong> $1.25/$10.00 por 1K tokens
                            </div>
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
    // showAIStatsModal - Termina Aqui
    
    // showAssistantModal - Inicia Aqui
    showAssistantModal(title, content) {
        const modal = document.getElementById('modal');
        const modalTitle = document.getElementById('modal-title');
        const modalBody = document.getElementById('modal-body');
        
        if (!modal || !modalTitle || !modalBody) {
            return;
        }
        
        modalTitle.textContent = title;
        modalBody.innerHTML = content;
        modal.style.display = 'flex';
        
        // Hacer focus en el modal para accesibilidad
        modal.focus();
    }
    // showAssistantModal - Termina Aqui
    
    // exportAIStats - Inicia Aqui
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
    // exportAIStats - Termina Aqui
    
    // clearAIStats - Inicia Aqui
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
    // clearAIStats - Termina Aqui
    
    // updateAIStats - Inicia Aqui
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
    // updateAIStats - Termina Aqui
    
    // exportChatHistory - Inicia Aqui
    exportChatHistory() {
        const chatData = {
            fecha: new Date().toISOString(),
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
        link.download = `tasktree-chat-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        URL.revokeObjectURL(url);
        this.showNotification('Historial de chat exportado', 'success');
    }
    // exportChatHistory - Termina Aqui
    
    // clearChatHistory - Inicia Aqui
    clearChatHistory() {
        if (confirm('¿Estás seguro de que quieres borrar todo el historial del chat? Esta acción no se puede deshacer.')) {
            this.mensajes = [];
            this.renderChatMessages();
            this.saveAssistantData();
            this.showNotification('Historial de chat limpiado', 'success');
        }
    }
    // clearChatHistory - Termina Aqui
    
    // importChatHistory - Inicia Aqui
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
    // importChatHistory - Termina Aqui
    
    // searchInChat - Inicia Aqui
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
    // searchInChat - Termina Aqui
    
    // highlightSearchTerm - Inicia Aqui
    highlightSearchTerm(text, term) {
        const regex = new RegExp(`(${term})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }
    // highlightSearchTerm - Termina Aqui
    
    // copyToClipboard - Inicia Aqui
    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            this.showNotification('Copiado al portapapeles', 'success');
        }).catch(() => {
            this.showNotification('Error al copiar', 'error');
        });
    }
    // copyToClipboard - Termina Aqui
    
    // showNotification - Inicia Aqui
    showNotification(message, type = 'info') {
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
    // showNotification - Termina Aqui

    // savePromptContexts - Inicia Aqui
    savePromptContexts() {
        try {
            localStorage.setItem('taskTreeAIPrompts', JSON.stringify(this.promptContexts));
        } catch (error) {
            // Error guardando prompts
        }
    }
    // savePromptContexts - Termina Aqui

    // deleteTaskById - Inicia Aqui
    deleteTaskById(taskId) {
        this.removeTaskById(taskId);
        this.saveAndRender();
    }
    // deleteTaskById - Termina Aqui
}
// TaskManager Class - Termina Aqui

// Inicialización - Inicia Aqui
let taskManager;

document.addEventListener('DOMContentLoaded', () => {
    taskManager = new TaskManager();
});
// Inicialización - Termina Aqui

// Funciones globales para compatibilidad - Inicia Aqui
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
// Funciones globales para compatibilidad - Termina Aqui