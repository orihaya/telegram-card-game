// Инициализация Telegram WebApp
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.expand();
    tg.enableClosingConfirmation();
}

// Состояние игры
const gameState = {
    players: [],
    deck: [],
    communityCards: [],
    currentPlayer: 0,
    bank: 0,
    currentBet: 0,
    gamePhase: 'waiting', // waiting, preflop, flop, turn, river, showdown
    botDelay: 1500,
    smallBlind: 10,
    bigBlind: 20
};

// Инициализация игры
function initGame() {
    // Создаем игроков
    const playerName = tg?.initDataUnsafe?.user?.first_name || 'Вы';
    gameState.players = [
        { id: 1, name: playerName, chips: 1000, cards: [], isFolded: false, isBot: false },
        { id: 2, name: 'Алексей', chips: 1000, cards: [], isFolded: false, isBot: true },
        { id: 3, name: 'Мария', chips: 1000, cards: [], isFolded: false, isBot: true }
    ];

    // Создаем и перемешиваем колоду
    gameState.deck = createDeck();
    shuffleDeck(gameState.deck);

    // Раздаем карты
    dealCards();

    // Начинаем игру
    startGame();
}

// Создание колоды
function createDeck() {
    const suits = ['♥', '♦', '♣', '♠'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const deck = [];

    for (const suit of suits) {
        for (const rank of ranks) {
            deck.push({
                suit,
                rank,
                value: getCardValue(rank),
                color: (suit === '♥' || suit === '♦') ? 'red' : 'black'
            });
        }
    }

    // Добавляем джокера
    deck.push({
        suit: '★',
        rank: 'Joker',
        value: 0,
        color: 'gold',
        isJoker: true
    });

    return deck;
}

// Значения карт
function getCardValue(rank) {
    const values = {
        '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
        'J': 11, 'Q': 12, 'K': 13, 'A': 14
    };
    return values[rank] || 0;
}

// Перемешивание колоды
function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

// Раздача карт
function dealCards() {
    // Раздаем по 2 карты каждому игроку
    for (let i = 0; i < 2; i++) {
        for (const player of gameState.players) {
            if (gameState.deck.length > 0) {
                player.cards.push(gameState.deck.pop());
            }
        }
    }
}

// Начало игры
function startGame() {
    gameState.gamePhase = 'preflop';
    gameState.currentPlayer = 0; // Начинаем с первого игрока после блайндов
    
    // Ставим блайнды
    postBlinds();
    
    updateUI();
    updateGameLog('Игра началась! Блайнды поставлены');
}

// Установка блайндов
function postBlinds() {
    const smallBlindPlayer = 1 % gameState.players.length;
    const bigBlindPlayer = 2 % gameState.players.length;
    
    gameState.players[smallBlindPlayer].chips -= gameState.smallBlind;
    gameState.players[bigBlindPlayer].chips -= gameState.bigBlind;
    gameState.bank = gameState.smallBlind + gameState.bigBlind;
    gameState.currentBet = gameState.bigBlind;
    
    updateGameLog(`${gameState.players[smallBlindPlayer].name} ставит малый блайнд (${gameState.smallBlind})`);
    updateGameLog(`${gameState.players[bigBlindPlayer].name} ставит большой блайнд (${gameState.bigBlind})`);
}

// Обновление интерфейса
function updateUI() {
    // Обновляем банк
    document.getElementById('bank-amount').textContent = gameState.bank;
    
    // Показываем карты игрока
    renderPlayerCards();
    
    // Показываем общие карты
    renderCommunityCards();
    
    // Показываем оппонентов
    renderOpponents();
    
    // Обновляем информацию о игроке
    updatePlayerInfo();
    
    // Показываем доступные действия
    renderActions();
}

// Отрисовка карт игрока
function renderPlayerCards() {
    const container = document.getElementById('player-cards');
    container.innerHTML = '';
    
    gameState.players[0].cards.forEach(card => {
        const cardElement = createCardElement(card);
        container.appendChild(cardElement);
    });
}

// Отрисовка общих карт
function renderCommunityCards() {
    const container = document.getElementById('community-cards');
    container.innerHTML = '';
    
    gameState.communityCards.forEach(card => {
        const cardElement = createCardElement(card);
        container.appendChild(cardElement);
    });
}

// Создание элемента карты
function createCardElement(card) {
    const cardElement = document.createElement('div');
    cardElement.className = `card ${card.color} ${card.isJoker ? 'joker' : ''}`;
    cardElement.textContent = card.rank;
    cardElement.dataset.suit = card.suit;
    return cardElement;
}

// Отрисовка оппонентов
function renderOpponents() {
    const container = document.getElementById('opponents');
    container.innerHTML = '';
    
    for (let i = 1; i < gameState.players.length; i++) {
        const player = gameState.players[i];
        const opponentElement = document.createElement('div');
        opponentElement.className = `opponent ${gameState.currentPlayer === i ? 'active-player' : ''}`;
        opponentElement.innerHTML = `
            <div>${player.name}</div>
            <div>${player.chips} фишек</div>
            <div>${player.isFolded ? 'Сбросил' : 'В игре'}</div>
        `;
        container.appendChild(opponentElement);
    }
}

// Обновление информации о игроке
function updatePlayerInfo() {
    document.getElementById('player-name').textContent = gameState.players[0].name;
    document.getElementById('player-chips').textContent = `${gameState.players[0].chips} фишек`;
}

// Отрисовка действий
function renderActions() {
    const container = document.getElementById('actions');
    container.innerHTML = '';
    
    const currentPlayer = gameState.players[gameState.currentPlayer];
    
    // Если ход игрока
    if (gameState.currentPlayer === 0 && !currentPlayer.isFolded) {
        // Кнопка сброса
        const foldBtn = document.createElement('button');
        foldBtn.className = 'action-btn fold-btn';
        foldBtn.textContent = 'Сбросить';
        foldBtn.onclick = () => handleFold();
        container.appendChild(foldBtn);
        
        // Кнопка проверки/колла
        const checkCallBtn = document.createElement('button');
        checkCallBtn.className = 'action-btn check-btn';
        checkCallBtn.textContent = gameState.currentBet > 0 ? 'Колл' : 'Проверить';
        checkCallBtn.onclick = () => handleCheckCall();
        container.appendChild(checkCallBtn);
        
        // Кнопка ставки
        const betBtn = document.createElement('button');
        betBtn.className = 'action-btn bet-btn';
        betBtn.textContent = 'Ставка';
        betBtn.onclick = () => handleBet();
        container.appendChild(betBtn);
    }
}

// Обработчики действий
function handleFold() {
    gameState.players[0].isFolded = true;
    updateGameLog(`${gameState.players[0].name} сбрасывает карты`);
    nextPlayer();
}

function handleCheckCall() {
    const player = gameState.players[0];
    const amount = Math.min(gameState.currentBet, player.chips);
    
    if (amount > 0) {
        player.chips -= amount;
        gameState.bank += amount;
        updateGameLog(`${player.name} делает колл (${amount})`);
    } else {
        updateGameLog(`${player.name} проверяет`);
    }
    
    nextPlayer();
}

function handleBet() {
    const minBet = gameState.currentBet > 0 ? gameState.currentBet * 2 : gameState.bigBlind;
    const betAmount = minBet;
    
    if (gameState.players[0].chips >= betAmount) {
        gameState.players[0].chips -= betAmount;
        gameState.bank += betAmount;
        gameState.currentBet = betAmount;
        updateGameLog(`${gameState.players[0].name} ставит ${betAmount}`);
        nextPlayer();
    } else {
        updateGameLog('Недостаточно фишек', true);
    }
}

// Переход к следующему игроку
function nextPlayer() {
    do {
        gameState.currentPlayer = (gameState.currentPlayer + 1) % gameState.players.length;
    } while (gameState.players[gameState.currentPlayer].isFolded);
    
    updateUI();
    
    // Если следующий игрок - бот
    if (gameState.currentPlayer !== 0) {
        setTimeout(() => makeBotMove(), gameState.botDelay);
    }
}

// Ход бота
function makeBotMove() {
    const bot = gameState.players[gameState.currentPlayer];
    const actions = [
        { name: 'fold', weight: 0.2 },
        { name: 'checkCall', weight: 0.6 },
        { name: 'bet', weight: 0.2 }
    ];
    
    // Выбираем случайное действие с учетом весов
    const random = Math.random();
    let action;
    let cumulativeWeight = 0;
    
    for (const a of actions) {
        cumulativeWeight += a.weight;
        if (random <= cumulativeWeight) {
            action = a.name;
            break;
        }
    }
    
    // Выполняем действие
    switch (action) {
        case 'fold':
            bot.isFolded = true;
            updateGameLog(`${bot.name} сбрасывает карты`);
            break;
        case 'checkCall':
            const amount = Math.min(gameState.currentBet, bot.chips);
            if (amount > 0) {
                bot.chips -= amount;
                gameState.bank += amount;
                updateGameLog(`${bot.name} делает колл (${amount})`);
            } else {
                updateGameLog(`${bot.name} проверяет`);
            }
            break;
        case 'bet':
            const betAmount = gameState.currentBet > 0 ? gameState.currentBet * 2 : gameState.bigBlind;
            if (bot.chips >= betAmount) {
                bot.chips -= betAmount;
                gameState.bank += betAmount;
                gameState.currentBet = betAmount;
                updateGameLog(`${bot.name} ставит ${betAmount}`);
            }
            break;
    }
    
    nextPlayer();
}

// Обновление лога игры
function updateGameLog(message, isError = false) {
    const logElement = document.getElementById('game-log');
    const messageElement = document.createElement('p');
    messageElement.textContent = message;
    if (isError) messageElement.style.color = '#e74c3c';
    logElement.appendChild(messageElement);
    logElement.scrollTop = logElement.scrollHeight;
}

// Запуск игры при загрузке
document.addEventListener('DOMContentLoaded', initGame);
