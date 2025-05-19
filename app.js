// Инициализация Telegram WebApp
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.expand();
    tg.enableClosingConfirmation();
}

// Состояние игры
const gameState = {
    players: [], // Список игроков
    deck: [], // Колода карт
    bank: 0, // Банк игры
    currentBet: 0, // Текущая ставка
    currentPlayer: 0, // Текущий игрок (индекс)
    dealer: 0, // Индекс раздающего
    gamePhase: 'waiting', // waiting, dealing, betting, showdown, swara
    baseBet: 50, // Базовая ставка (договорились перед игрой)
    botDelay: 1500, // Задержка хода бота
};

// Инициализация игры
function initGame() {
    // Создаём игроков (1 реальный + 2 бота для примера, до 7 игроков)
    const playerName = tg?.initDataUnsafe?.user?.first_name || 'Вы';
    gameState.players = [
        { id: 1, name: playerName, chips: 1000, cards: [], isFolded: false, isBot: false, isBlind: false, bet: 0 },
        { id: 2, name: 'Алексей', chips: 1000, cards: [], isFolded: false, isBot: true, isBlind: false, bet: 0 },
        { id: 3, name: 'Мария', chips: 1000, cards: [], isFolded: false, isBot: true, isBlind: false, bet: 0 }
    ];

    // Выбираем раздающего
    chooseDealer();
}

// Создание колоды (21 карта + джокер)
function createDeck() {
    const suits = ['♥', '♦', '♣', '♠'];
    const ranks = ['10', 'J', 'Q', 'K', 'A'];
    const deck = [];

    for (const suit of suits) {
        for (const rank of ranks) {
            deck.push({
                suit,
                rank,
                value: rank === 'A' ? 11 : 10, // Туз = 11, остальные = 10
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

// Перемешивание колоды
function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

// Выбор раздающего (по первой вытянутой карте с тузом)
function chooseDealer() {
    gameState.deck = createDeck();
    shuffleDeck(gameState.deck);
    let tempDeck = [...gameState.deck];

    for (let i = 0; i < gameState.players.length; i++) {
        const card = tempDeck.pop();
        updateGameLog(`${gameState.players[i].name} вытянул ${card.rank}${card.suit}`);
        if (card.rank === 'A') {
            gameState.dealer = i;
            updateGameLog(`${gameState.players[i].name} становится раздающим!`);
            break;
        }
    }

    // Начинаем новый раунд
    startRound();
}

// Начало раунда
function startRound() {
    gameState.gamePhase = 'dealing';
    gameState.bank = 0;
    gameState.currentBet = gameState.baseBet;
    gameState.currentPlayer = (gameState.dealer + 1) % gameState.players.length;

    // Сбрасываем состояние игроков
    gameState.players.forEach(player => {
        player.cards = [];
        player.isFolded = false;
        player.isBlind = false;
        player.bet = 0;
    });

    // Создаём и перемешиваем колоду
    gameState.deck = createDeck();
    shuffleDeck(gameState.deck);

    // Собираем базовые ставки
    gameState.players.forEach(player => {
        player.chips -= gameState.baseBet;
        player.bet = gameState.baseBet;
        gameState.bank += gameState.baseBet;
        updateGameLog(`${player.name} вносит базовую ставку (${gameState.baseBet})`);
    });

    // Раздаём карты
    dealCards();
    updateGameLog('Карты розданы!');

    // Начинаем торги
    startBetting();
}

// Раздача карт (по 3 карты каждому игроку)
function dealCards() {
    for (let i = 0; i < 3; i++) {
        for (const player of gameState.players) {
            if (gameState.deck.length > 0) {
                player.cards.push(gameState.deck.pop());
            }
        }
    }
}

// Начало торгов
function startBetting() {
    gameState.gamePhase = 'betting';
    updateUI();
    updateGameLog('Начались торги!');
    if (gameState.players[gameState.currentPlayer].isBot) {
        setTimeout(() => makeBotMove(), gameState.botDelay);
    }
}

// Обновление интерфейса
function updateUI() {
    // Обновляем банк
    document.getElementById('bank-amount').textContent = gameState.bank;

    // Показываем карты игрока
    renderPlayerCards();

    // Показываем оппонентов
    renderOpponents();

    // Обновляем информацию о игрока
    updatePlayerInfo();

    // Показываем доступные действия
    renderActions();
}

// Отрисовка карт игрока
function renderPlayerCards() {
    const container = document.getElementById('player-cards');
    container.innerHTML = '';

    const player = gameState.players[0];
    if (player.isBlind) {
        // Если игрок "в тёмную", показываем рубашку карт
        for (let i = 0; i < 3; i++) {
            const cardElement = document.createElement('div');
            cardElement.className = 'card back';
            cardElement.textContent = '🂠';
            container.appendChild(cardElement);
        }
    } else {
        // Показываем карты игрока
        player.cards.forEach(card => {
            const cardElement = createCardElement(card);
            container.appendChild(cardElement);
        });
    }
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
        opponentElement.className = `opponent ${gameState.currentPlayer === i ? 'active-player' : ''} ${player.isBlind ? 'blind' : ''}`;
        opponentElement.innerHTML = `
            <div>${player.name}</div>
            <div>${player.chips} фишек</div>
            <div>${player.isFolded ? 'Сбросил' : player.isBlind ? 'В тёмную' : 'В игре'}</div>
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

    // Если ход игрока и он не сбросил карты
    if (gameState.currentPlayer === 0 && !currentPlayer.isFolded && gameState.gamePhase === 'betting') {
        // Кнопка сброса
        const foldBtn = document.createElement('button');
        foldBtn.className = 'action-btn fold-btn';
        foldBtn.textContent = 'Сбросить';
        foldBtn.onclick = () => handleFold();
        container.appendChild(foldBtn);

        // Кнопка подтверждения (колл)
        const callBtn = document.createElement('button');
        callBtn.className = 'action-btn check-btn';
        callBtn.textContent = 'Подтвердить';
        callBtn.onclick = () => handleCall();
        container.appendChild(callBtn);

        // Кнопка повышения ставки
        const raiseBtn = document.createElement('button');
        raiseBtn.className = 'action-btn bet-btn';
        raiseBtn.textContent = 'Повысить';
        raiseBtn.onclick = () => handleRaise();
        container.appendChild(raiseBtn);

        // Кнопка игры "в тёмную" (только для игрока слева от раздающего в начале)
        if (gameState.currentPlayer === (gameState.dealer + 1) % gameState.players.length && !currentPlayer.isBlind) {
            const blindBtn = document.createElement('button');
            blindBtn.className = 'action-btn raise-btn';
            blindBtn.textContent = 'В тёмную';
            blindBtn.onclick = () => handleBlind();
            container.appendChild(blindBtn);
        }

        // Кнопка вскрытия карт
        const showdownBtn = document.createElement('button');
        showdownBtn.className = 'action-btn raise-btn';
        showdownBtn.textContent = 'Вскрыть карты';
        showdownBtn.onclick = () => handleShowdown();
        container.appendChild(showdownBtn);
    }
}

// Обработчики действий
function handleFold() {
    const player = gameState.players[0];
    player.isFolded = true;
    updateGameLog(`${player.name} сбрасывает карты`);
    nextPlayer();
}

function handleCall() {
    const player = gameState.players[0];
    const amount = gameState.currentBet - player.bet; // Дополняем до текущей ставки
    if (amount > player.chips) {
        updateGameLog('Недостаточно фишек!', true);
        return;
    }
    player.chips -= amount;
    player.bet += amount;
    gameState.bank += amount;
    updateGameLog(`${player.name} подтверждает ставку (${amount})`);
    nextPlayer();
}

function handleRaise() {
    const player = gameState.players[0];
    const raiseAmount = gameState.currentBet * 2; // Повышаем в 2 раза
    const amount = raiseAmount - player.bet;
    if (amount > player.chips) {
        updateGameLog('Недостаточно фишек!', true);
        return;
    }
    player.chips -= amount;
    player.bet += amount;
    gameState.bank += amount;
    gameState.currentBet = raiseAmount;
    updateGameLog(`${player.name} повышает ставку до ${raiseAmount}`);
    nextPlayer();
}

function handleBlind() {
    const player = gameState.players[0];
    const blindBet = gameState.currentBet * 2; // Удваиваем ставку для игры "в тёмную"
    const amount = blindBet - player.bet;
    if (amount > player.chips) {
        updateGameLog('Недостаточно фишек!', true);
        return;
    }
    player.isBlind = true;
    player.chips -= amount;
    player.bet += amount;
    gameState.bank += amount;
    gameState.currentBet = blindBet;
    updateGameLog(`${player.name} играет в тёмную с ставкой ${blindBet}`);
    updateUI();
    nextPlayer();
}

function handleShowdown() {
    gameState.gamePhase = 'showdown';
    updateGameLog('Вскрываем карты!');
    determineWinner();
}

// Переход к следующему игроку
function nextPlayer() {
    do {
        gameState.currentPlayer = (gameState.currentPlayer + 1) % gameState.players.length;
    } while (gameState.players[gameState.currentPlayer].isFolded);

    updateUI();

    // Если следующий игрок — бот
    if (gameState.players[gameState.currentPlayer].isBot && gameState.gamePhase === 'betting') {
        setTimeout(() => makeBotMove(), gameState.botDelay);
    }
}

// Ход бота
function makeBotMove() {
    const bot = gameState.players[gameState.currentPlayer];
    // Простая логика: бот подтверждает или сбрасывает
    const actions = [
        { name: 'fold', weight: bot.isBlind ? 0.1 : 0.3 }, // Меньше сбрасывает, если "в тёмную"
        { name: 'call', weight: 0.5 },
        { name: 'raise', weight: 0.2 }
    ];

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

    const amount = gameState.currentBet - bot.bet;
    switch (action) {
        case 'fold':
            bot.isFolded = true;
            updateGameLog(`${bot.name} сбрасывает карты`);
            break;
        case 'call':
            if (amount <= bot nook.chips) {
                bot.chips -= amount;
                bot.bet += amount;
                gameState.bank += amount;
                updateGameLog(`${bot.name} подтверждает ставку (${amount})`);
            } else {
                bot.isFolded = true;
                updateGameLog(`${bot.name} сбрасывает из-за нехватки фишек`);
            }
            break;
        case 'raise':
            const raiseAmount = gameState.currentBet * 2;
            const raiseDiff = raiseAmount - bot.bet;
            if (raiseDiff <= bot.chips) {
                bot.chips -= raiseDiff;
                bot.bet += raiseDiff;
                gameState.bank += raiseDiff;
                gameState.currentBet = raiseAmount;
                updateGameLog(`${bot.name} повышает ставку до ${raiseAmount}`);
            } else {
                bot.isFolded = true;
                updateGameLog(`${bot.name} сбрасывает из-за нехватки фишек`);
            }
            break;
    }

    nextPlayer();
}

// Подсчёт очков игрока
function calculatePoints(cards) {
    // Проверяем, есть ли джокер
    const hasJoker = cards.some(card => card.isJoker);
    const nonJokerCards = cards.filter(card => !card.isJoker);

    // Все карты одной масти (с учётом джокера)
    const sameSuit = nonJokerCards.every(card => card.suit === nonJokerCards[0]?.suit);
    if (sameSuit || (hasJoker && nonJokerCards.length <= 2)) {
        return cards.reduce((sum, card) => sum + (card.isJoker ? 10 : card.value), 0); // Джокер = 10 (среднее)
    }

    // Карты одинакового номинала
    const sameRank = nonJokerCards.every(card => card.rank === nonJokerCards[0]?.rank);
    if (sameRank || (hasJoker && nonJokerCards.length === 2 && nonJokerCards[0].rank === nonJokerCards[1].rank)) {
        return cards.reduce((sum, card) => sum + (card.isJoker ? 10 : card.value), 0);
    }

    // Только старшая карта
    return Math.max(...cards.map(card => card.isJoker ? 10 : card.value));
}

// Определение победителя
function determineWinner() {
    const activePlayers = gameState.players.filter(player => !player.isFolded);
    if (activePlayers.length === 0) {
        updateGameLog('Никто не остался в игре!');
        startRound();
        return;
    }

    // Подсчитываем очки
    const scores = activePlayers.map(player => ({
        player,
        points: calculatePoints(player.cards)
    }));

    // Находим максимальное количество очков
    const maxPoints = Math.max(...scores.map(s => s.points));
    const winners = scores.filter(s => s.points === maxPoints);

    // Показываем карты и очки
    activePlayers.forEach(player => {
        const cardsStr = player.cards.map(c => `${c.rank}${c.suit}`).join(', ');
        const points = calculatePoints(player.cards);
        updateGameLog(`${player.name} показывает карты: ${cardsStr} (${points} очков)`);
    });

    if (winners.length === 1) {
        // Один победитель
        const winner = winners[0].player;
        winner.chips += gameState.bank;
        updateGameLog(`${winner.name} побеждает и забирает банк (${gameState.bank})!`);
        startRound();
    } else {
        // Ничья, начинаем свару
        updateGameLog('Ничья! Начинается свара.');
        startSwara(winners.map(w => w.player));
    }
}

// Свара (дополнительный раунд при ничьей)
function startSwara(winners) {
    gameState.gamePhase = 'swara';
    gameState.players.forEach(player => {
        if (!winners.includes(player)) {
            player.isFolded = true;
        } else {
            // Вносим дополнительную ставку
            const swaraBet = gameState.baseBet;
            if (player.chips >= swaraBet) {
                player.chips -= swaraBet;
                player.bet += swaraBet;
                gameState.bank += swaraBet;
                updateGameLog(`${player.name} вносит ставку в свару (${swaraBet})`);
            } else {
                player.isFolded = true;
                updateGameLog(`${player.name} выбывает из свары из-за нехватки фишек`);
            }
        }
    });

    // Раздаём новые карты оставшимся игрокам
    gameState.deck = createDeck();
    shuffleDeck(gameState.deck);
    dealCards();
    updateGameLog('Карты для свары розданы!');

    // Вскрываем карты
    determineWinner();
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
