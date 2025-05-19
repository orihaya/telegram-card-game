// =============================================
// Инициализация Telegram WebApp или mock-объекта
// =============================================

let tg;
let isTelegram = false;

try {
    if (window.Telegram && window.Telegram.WebApp) {
        tg = window.Telegram.WebApp;
        isTelegram = true;
        
        // Инициализация Telegram WebApp
        tg.expand();
        tg.enableClosingConfirmation();
        
        // Настройка основной кнопки
        tg.MainButton.setText('Закрыть игру').show();
        tg.MainButton.onClick(() => tg.close());
        
        console.log("Running in Telegram WebApp");
    } else {
        throw new Error("Telegram WebApp not detected");
    }
} catch (error) {
    console.log("Running in browser mode", error);
    isTelegram = false;
    
    // Создаем mock-объект для тестирования
    tg = {
        initData: '',
        initDataUnsafe: {},
        expand: () => console.log("App expanded"),
        enableClosingConfirmation: () => console.log("Closing confirmation enabled"),
        close: () => {
            console.log("App closed");
            document.getElementById('app').innerHTML = '<h1>Игра завершена</h1><p>В Telegram игра будет закрыта</p>';
        },
        MainButton: {
            setText: (text) => {
                console.log(`Button text set to: ${text}`);
                return tg.MainButton;
            },
            show: () => {
                console.log("Button shown");
                document.getElementById('debug-close').style.display = 'block';
            },
            onClick: (callback) => {
                console.log("Click handler set");
                document.getElementById('debug-close').onclick = callback;
            },
            hide: () => {
                console.log("Button hidden");
                document.getElementById('debug-close').style.display = 'none';
            }
        },
        showAlert: (message, callback) => {
            alert(message);
            if (callback) callback();
        }
    };
    
    // Показываем кнопку закрытия для тестирования
    document.getElementById('debug-close').style.display = 'block';
}

// =============================================
// Игровая логика
// =============================================

const gameState = {
    players: [
        { id: 1, name: 'Вы', chips: 1000, cards: [], isActive: true, isFolded: false },
        { id: 2, name: 'Игрок 2', chips: 1000, cards: [], isActive: false, isFolded: false },
        { id: 3, name: 'Игрок 3', chips: 1000, cards: [], isActive: false, isFolded: false }
    ],
    currentPlayerIndex: 0,
    bank: 0,
    deck: [],
    currentBet: 0,
    gamePhase: 'waiting', // waiting, dealing, betting, showdown
    settings: {
        minBet: 10,
        maxPlayers: 7
    }
};

// Инициализация игры
function initGame() {
    createDeck();
    shuffleDeck();
    dealCards();
    updateUI();
    
    if (isTelegram) {
        // Получаем данные пользователя из Telegram
        const user = tg.initDataUnsafe.user;
        if (user) {
            gameState.players[0].name = `${user.first_name || 'Игрок'} ${user.last_name || ''}`.trim();
        }
    }
}

// Создание колоды карт
function createDeck() {
    const suits = ['♥', '♦', '♣', '♠'];
    const ranks = [
        { rank: '10', value: 10 },
        { rank: 'J', value: 10 },
        { rank: 'Q', value: 10 },
        { rank: 'K', value: 10 },
        { rank: 'A', value: 11 }
    ];
    
    gameState.deck = [];
    
    // Добавляем обычные карты
    for (const suit of suits) {
        for (const card of ranks) {
            gameState.deck.push({
                suit,
                rank: card.rank,
                value: card.value,
                id: `${card.rank}${suit}`,
                color: (suit === '♥' || suit === '♦') ? 'red' : 'black'
            });
        }
    }
    
    // Добавляем джокера
    gameState.deck.push({
        suit: '★',
        rank: 'Joker',
        value: 0,
        id: 'Joker',
        color: 'gold'
    });
}

// Перемешивание колоды
function shuffleDeck() {
    for (let i = gameState.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [gameState.deck[i], gameState.deck[j]] = [gameState.deck[j], gameState.deck[i]];
    }
}

// Раздача карт
function dealCards() {
    // Раздаем по 3 карты каждому игроку
    for (let i = 0; i < 3; i++) {
        for (const player of gameState.players) {
            if (gameState.deck.length > 0) {
                player.cards.push(gameState.deck.pop());
            }
        }
    }
    
    gameState.gamePhase = 'betting';
    gameState.currentPlayerIndex = 1; // Начинаем со следующего игрока после дилера
}

// Обновление интерфейса
function updateUI() {
    // Показываем карты текущего игрока (первого в массиве - это вы)
    renderCards(gameState.players[0].cards);
    
    // Обновляем банк
    document.getElementById('bank').textContent = `Банк: ${gameState.bank}`;
    
    // Обновляем список игроков
    renderPlayersList();
    
    // Обновляем доступные действия
    renderActions();
}

// Отрисовка карт
function renderCards(cards) {
    const container = document.getElementById('player-cards');
    container.innerHTML = '';
    
    cards.forEach(card => {
        const cardElement = document.createElement('div');
        cardElement.className = `card ${card.color}`;
        cardElement.innerHTML = `
            <div class="rank">${card.rank}</div>
            <div class="suit">${card.suit}</div>
        `;
        container.appendChild(cardElement);
    });
}

// Отрисовка списка игроков
function renderPlayersList() {
    const container = document.getElementById('players-list');
    container.innerHTML = '<h3>Игроки:</h3>';
    
    gameState.players.forEach(player => {
        const playerElement = document.createElement('div');
        playerElement.className = 'player';
        playerElement.innerHTML = `
            <span class="player-name">${player.name} ${player.isActive ? '▶' : ''}</span>
            <span class="player-chips">${player.chips} фишек</span>
        `;
        container.appendChild(playerElement);
    });
}

// Отрисовка доступных действий
function renderActions() {
    const actions = document.getElementById('actions');
    actions.innerHTML = '';
    
    const currentPlayer = gameState.players[0]; // Вы - всегда первый игрок
    
    if (gameState.gamePhase === 'betting') {
        // Кнопка сброса
        const foldButton = document.createElement('button');
        foldButton.className = 'fold';
        foldButton.textContent = 'Сбросить';
        foldButton.onclick = () => handleFold();
        actions.appendChild(foldButton);
        
        // Кнопка проверки
        const checkButton = document.createElement('button');
        checkButton.className = 'check';
        checkButton.textContent = 'Проверить';
        checkButton.onclick = () => handleCheck();
        actions.appendChild(checkButton);
        
        // Кнопка ставки
        const betButton = document.createElement('button');
        betButton.className = 'bet';
        betButton.textContent = `Ставка (${gameState.settings.minBet})`;
        betButton.onclick = () => handleBet(gameState.settings.minBet);
        actions.appendChild(betButton);
        
        // Кнопка повышения
        const raiseButton = document.createElement('button');
        raiseButton.className = 'raise';
        raiseButton.textContent = `Поднять (${gameState.settings.minBet * 2})`;
        raiseButton.onclick = () => handleRaise(gameState.settings.minBet * 2);
        actions.appendChild(raiseButton);
    }
}

// Обработчики действий
function handleFold() {
    gameState.players[0].isFolded = true;
    tg.showAlert('Вы сбросили карты', () => {
        gameState.gamePhase = 'showdown';
        updateUI();
    });
}

function handleCheck() {
    tg.showAlert('Вы проверяете');
    // Переход хода к следующему игроку
    nextPlayer();
}

function handleBet(amount) {
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

function handleRaise(amount) {
    if (gameState.players[0].chips >= amount) {
        gameState.players[0].chips -= amount;
        gameState.bank += amount;
        gameState.currentBet = amount;
        tg.showAlert(`Вы повысили ставку до ${amount}`);
        nextPlayer();
    } else {
        tg.showAlert('Недостаточно фишек');
    }
}

function nextPlayer() {
    gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
    
    // Сбрасываем активность у всех
    gameState.players.forEach(p => p.isActive = false);
    
    // Устанавливаем активность текущему игроку
    gameState.players[gameState.currentPlayerIndex].isActive = true;
    
    updateUI();
    
    // Если это бот - делаем автоматический ход
    if (gameState.currentPlayerIndex !== 0 && isTelegram) {
        setTimeout(() => {
            makeBotMove();
        }, 1500);
    }
}

function makeBotMove() {
    const bot = gameState.players[gameState.currentPlayerIndex];
    const randomAction = Math.floor(Math.random() * 3);
    
    switch (randomAction) {
        case 0:
            handleFold();
            break;
        case 1:
            handleCheck();
            break;
        case 2:
            handleBet(gameState.settings.minBet);
            break;
    }
}

// Запуск игры при загрузке страницы
document.addEventListener('DOMContentLoaded', initGame);