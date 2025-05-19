// ==================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ====================
let tg;
let gameState;

// ==================== ОСНОВНАЯ ИНИЦИАЛИЗАЦИЯ ====================
document.addEventListener('DOMContentLoaded', function() {
    // Инициализация Telegram WebApp
    if (window.Telegram && window.Telegram.WebApp) {
        tg = window.Telegram.WebApp;
        tg.expand();
        tg.enableClosingConfirmation();
        tg.MainButton.setText('Закрыть').show();
        tg.MainButton.onClick(() => tg.close());
        logDebug('Telegram WebApp инициализирован');
    } else {
        logDebug('Режим разработки (вне Telegram)');
        tg = {
            showAlert: (msg, callback) => { alert(msg); if(callback) callback(); },
            close: () => console.log('App closed')
        };
    }

    // Инициализация игры
    initGame();
});

// ==================== ИГРОВАЯ ЛОГИКА ====================
function initGame() {
    // Инициализация состояния игры
    gameState = {
        players: [
            { id: 1, name: 'Вы', chips: 1000, cards: [], isActive: true, isFolded: false },
            { id: 2, name: 'Игрок 2', chips: 1000, cards: [], isActive: false, isFolded: false },
            { id: 3, name: 'Игрок 3', chips: 1000, cards: [], isActive: false, isFolded: false }
        ],
        currentPlayerIndex: 0,
        bank: 0,
        deck: [],
        currentBet: 0,
        gamePhase: 'waiting',
        settings: { minBet: 10, maxPlayers: 7 }
    };

    // Установка имени игрока из Telegram
    if (window.Telegram && window.Telegram.WebApp && tg.initDataUnsafe.user) {
        const user = tg.initDataUnsafe.user;
        gameState.players[0].name = `${user.first_name || 'Игрок'} ${user.last_name || ''}`.trim();
    }

    createDeck();
    shuffleDeck();
    dealCards();
    updateUI();

    logDebug('Игра инициализирована', gameState);
}

// ... (функции createDeck, shuffleDeck, dealCards остаются без изменений) ...

// ==================== ОБНОВЛЕНИЕ ИНТЕРФЕЙСА ====================
function updateUI() {
    try {
        // Обновляем карты
        renderCards(gameState.players[0].cards);
        
        // Обновляем банк
        document.getElementById('bank').textContent = `Банк: ${gameState.bank}`;
        
        // Обновляем список игроков
        renderPlayersList();
        
        // Обновляем действия
        renderActions();
        
        // Обновляем статус игры
        document.getElementById('game-state').textContent = 
            gameState.players[0].isActive ? "Ваш ход" : "Ожидайте хода";
            
    } catch (e) {
        logDebug('Ошибка при обновлении UI:', e);
    }
}

function renderCards(cards) {
    const container = document.getElementById('player-cards');
    container.innerHTML = '';
    
    cards.forEach(card => {
        const cardEl = document.createElement('div');
        cardEl.className = `card ${card.color}`;
        cardEl.innerHTML = `<div>${card.rank}</div><div>${card.suit}</div>`;
        container.appendChild(cardEl);
    });
}

function renderPlayersList() {
    const container = document.getElementById('players-list');
    container.innerHTML = '<h3>Игроки:</h3>';
    
    gameState.players.forEach(player => {
        const playerEl = document.createElement('div');
        playerEl.className = 'player';
        playerEl.innerHTML = `
            <span>${player.name} ${player.isActive ? '▶' : ''}</span>
            <span>${player.chips} фишек</span>
        `;
        container.appendChild(playerEl);
    });
}

// ==================== ОБРАБОТЧИКИ ДЕЙСТВИЙ ====================
function renderActions() {
    const container = document.getElementById('actions');
    container.innerHTML = '';
    
    // Убедимся, что это ход игрока
    if (!gameState.players[0].isActive || gameState.players[0].isFolded) return;
    
    const actions = [
        { id: 'fold', text: 'Сбросить', handler: handleFold, class: 'fold' },
        { id: 'check', text: 'Проверить', handler: handleCheck, class: 'check' },
        { id: 'bet', text: `Ставка (${gameState.settings.minBet})`, 
          handler: () => handleBet(gameState.settings.minBet), class: 'bet' },
        { id: 'raise', text: `Поднять (${gameState.settings.minBet * 2})`, 
          handler: () => handleBet(gameState.settings.minBet * 2), class: 'raise' }
    ];
    
    actions.forEach(action => {
        const btn = document.createElement('button');
        btn.id = action.id;
        btn.className = action.class;
        btn.textContent = action.text;
        
        // Правильное назначение обработчика
        btn.addEventListener('click', action.handler);
        
        // Для мобильных устройств
        btn.addEventListener('touchend', action.handler);
        
        container.appendChild(btn);
    });
}

function handleFold() {
    logDebug('Сброс карт');
    gameState.players[0].isFolded = true;
    tg.showAlert('Вы сбросили карты', () => {
        gameState.gamePhase = 'showdown';
        updateUI();
    });
}

function handleCheck() {
    logDebug('Проверка');
    tg.showAlert('Вы проверяете');
    nextPlayer();
}

function handleBet(amount) {
    logDebug(`Ставка ${amount}`);
    if (gameState.players[0].chips >= amount) {
        gameState.players[0].chips -= amount;
        gameState.bank += amount;
        gameState.currentBet = amount;
        tg.showAlert(`Вы поставили ${amount}`);
        nextPlayer();
    } else {
        tg.showAlert('Недостаточно фишек');
    }
}

function nextPlayer() {
    gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
    gameState.players.forEach(p => p.isActive = false);
    gameState.players[gameState.currentPlayerIndex].isActive = true;
    
    updateUI();
    
    // Если это бот - делаем ход
    if (gameState.currentPlayerIndex !== 0) {
        setTimeout(makeBotMove, 1500);
    }
}

function makeBotMove() {
    const actions = [handleFold, handleCheck, () => handleBet(gameState.settings.minBet)];
    const randomAction = actions[Math.floor(Math.random() * actions.length)];
    randomAction.call(this);
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
function logDebug(message, data) {
    console.log(message, data);
    const debugEl = document.getElementById('debug-console');
    if (debugEl) {
        debugEl.innerHTML += `<div>${message}</div>`;
    }
}
