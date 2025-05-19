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
    baseBet: 50, // Обязательная ставка
    maxBet: 1000, // Потолок ставки
    botDelay: 1500, // Задержка хода бота
    bettingRound: 0, // Круг торгов (0 = первый)
    isSwara: false, // Флаг свары
};

// Инициализация игры после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM загружен, начинаю initGame');
    initGame();
});

// Создание колоды (36 карт, джокер = трефовая семёрка)
function createDeck() {
    const suits = ['♥', '♦', '♣', '♠'];
    const ranks = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const deck = [];

    for (const suit of suits) {
        for (const rank of ranks) {
            const isJoker = (suit === '♣' && rank === '7');
            deck.push({
                suit,
                rank,
                value: isJoker ? 11 : (rank === 'A' ? 11 : (['J', 'Q', 'K'].includes(rank) ? 10 : parseInt(rank))),
                color: (suit === '♥' || suit === '♦') ? 'red' : 'black',
                isJoker: isJoker
            });
        }
    }

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

// Выбор раздающего (по первой карте с тузом)
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

    startRound();
}

// Начало раунда
function startRound() {
    gameState.gamePhase = 'dealing';
    gameState.bank = 0;
    gameState.currentBet = gameState.baseBet;
    gameState.currentPlayer = (gameState.dealer + 1) % gameState.players.length;
    gameState.bettingRound = 0;
    gameState.isSwara = false;

    gameState.players.forEach(player => {
        player.cards = [];
        player.isFolded = false;
        player.isBlind = false;
        player.bet = 0;
    });

    gameState.deck = createDeck();
    shuffleDeck(gameState.deck);

    gameState.players.forEach(player => {
        player.chips -= gameState.baseBet;
        player.bet = gameState.baseBet;
        gameState.bank += gameState.baseBet;
        updateGameLog(`${player.name} вносит обязательную ставку (${gameState.baseBet})`);
    });

    dealCards();
    updateGameLog('Карты розданы!');
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
    updateGameLog(`Круг торгов ${gameState.bettingRound + 1}`);
    if (gameState.players[gameState.currentPlayer].isBot) {
        setTimeout(() => makeBotMove(), gameState.botDelay);
    }
}

// Подсчёт очков игрока
function calculatePoints(cards) {
    // Проверяем наличие джокера (трефовая семёрка)
    const hasJoker = cards.some(card => card.isJoker);
    const nonJokerCards = cards.filter(card => !card.isJoker);

    // Проверяем наличие двух тузов
    const aceCount = cards.filter(card => card.rank === 'A').length;
    if (aceCount >= 2) {
        return 22; // Два туза = 22 очка
    }

    // Проверяем три одинаковых ранга
    const sameRank = nonJokerCards.every(card => card.rank === nonJokerCards[0]?.rank);
    if (sameRank || (hasJoker && nonJokerCards.length === 2 && nonJokerCards[0].rank === nonJokerCards[1].rank)) {
        const rank = nonJokerCards[0]?.rank || cards[0].rank;
        if (rank === '6') {
            return 34; // Три шестерки = 34 очка
        }
        return cards.reduce((sum, card) => sum + (card.isJoker ? nonJokerCards[0].value : card.value), 0);
    }

    // Подсчёт по мастям
    const suits = {};
    cards.forEach(card => {
        if (!card.isJoker) {
            suits[card.suit] = suits[card.suit] || [];
            suits[card.suit].push(card.value);
        }
    });

    if (hasJoker) {
        // Джокер добавляем к масти с наибольшим количеством карт
        const maxSuit = Object.keys(suits).reduce((a, b) => suits[a].length > suits[b].length ? a : b, Object.keys(suits)[0]);
        suits[maxSuit] = suits[maxSuit] || [];
        suits[maxSuit].push(11); // Джокер = 11 очков
    }

    const suitSums = Object.values(suits).map(values => values.reduce((sum, val) => sum + val, 0));
    return suitSums.length > 0 ? Math.max(...suitSums) : (hasJoker ? 11 : 0);
}

// Обновление интерфейса
function updateUI() {
    console.log('Обновляю UI');
    document.getElementById('bank-amount').textContent = gameState.bank;

    renderPlayerCards();
    renderOpponents();
    updatePlayerInfo();
    renderActions();
}

// Отрисовка карт игрока
function renderPlayerCards() {
    const container = document.getElementById('player-cards');
    container.innerHTML = '';

    const player = gameState.players[0];
    if (player.isBlind) {
        for (let i = 0; i < 3; i++) {
            const cardElement = document.createElement('div');
            cardElement.className = 'card back';
            cardElement.textContent = '🂠';
            container.appendChild(cardElement);
        }
    } else {
        player.cards.forEach(card => {
            const cardElement = createCardElement(card);
            container.appendChild(cardElement);
        });
        // Показываем комбинацию и очки
        const points = calculatePoints(player.cards);
        updateGameLog(`Ваша комбинация: ${player.cards.map(c => `${c.rank}${c.suit}`).join(', ')} (${points} очков)`);
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

    if (gameState.currentPlayer !== 0 || currentPlayer.isFolded || gameState.gamePhase !== 'betting') {
        return;
    }

    // Кнопка "Упасть"
    const foldBtn = document.createElement('button');
    foldBtn.className = 'action-btn fold-btn';
    foldBtn.textContent = 'Упасть';
    foldBtn.onclick = () => handleFold();
    container.appendChild(foldBtn);

    // Кнопка "Смотреть" (для темнящих)
    if (currentPlayer.isBlind) {
        const seeBtn = document.createElement('button');
        seeBtn.className = 'action-btn check-btn';
        seeBtn.textContent = 'Смотреть';
        seeBtn.onclick = () => handleSee();
        container.appendChild(seeBtn);
    }

    // Кнопка "Поддержать"
    const callBtn = document.createElement('button');
    callBtn.className = 'action-btn check-btn';
    callBtn.textContent = 'Поддержать';
    callBtn.onclick = () => handleCall();
    container.appendChild(callBtn);

    // Кнопка "Повысить"
    const raiseBtn = document.createElement('button');
    raiseBtn.className = 'action-btn bet-btn';
    raiseBtn.textContent = 'Повысить';
    raiseBtn.onclick = () => handleRaise();
    container.appendChild(raiseBtn);

    // Кнопка "Вскрыться" (после первого круга)
    if (gameState.bettingRound > 0) {
        const showdownBtn = document.createElement('button');
        showdownBtn.className = 'action-btn raise-btn';
        showdownBtn.textContent = 'Вскрыться';
        showdownBtn.onclick = () => handleShowdown();
        container.appendChild(showdownBtn);
    }

    // Кнопка "В тёмную" (только если игрок не темнит и не в сваре)
    if (!currentPlayer.isBlind && !gameState.isSwara && gameState.currentPlayer === (gameState.dealer + 1) % gameState.players.length) {
        const blindBtn = document.createElement('button');
        blindBtn.className = 'action-btn raise-btn';
        blindBtn.textContent = 'В тёмную';
        blindBtn.onclick = () => handleBlind();
        container.appendChild(blindBtn);
    }
}

// Обработчики действий
function handleFold() {
    const player = gameState.players[0];
    player.isFolded = true;
    updateGameLog(`${player.name} упал`);
    checkEndOfRound();
}

function handleSee() {
    const player = gameState.players[0];
    player.isBlind = false;
    updateGameLog(`${player.name} посмотрел свои карты`);
    updateUI();
    nextPlayer();
}

function handleCall() {
    const player = gameState.players[0];
    let amount = gameState.currentBet - player.bet;
    if (player.isBlind) {
        // Если игрок темнит, он платит свою ставку
        amount = gameState.currentBet / 2 - player.bet;
    }
    if (amount > player.chips) {
        updateGameLog(`${player.name} выбывает из-за нехватки фишек`);
        player.isFolded = true;
        checkEndOfRound();
        return;
    }
    player.chips -= amount;
    player.bet += amount;
    gameState.bank += amount;
    updateGameLog(`${player.name} поддерживает ставку (${amount})`);
    checkEndOfRound();
}

function handleRaise() {
    const player = gameState.players[0];
    let raiseAmount = gameState.currentBet * 2; // Удваиваем текущую ставку
    if (raiseAmount > gameState.maxBet) raiseAmount = gameState.maxBet;
    let amount = raiseAmount - player.bet;
    if (player.isBlind) {
        amount = raiseAmount / 2 - player.bet;
    }
    if (amount > player.chips) {
        updateGameLog('Недостаточно фишек!', true);
        return;
    }
    player.chips -= amount;
    player.bet += amount;
    gameState.bank += amount;
    gameState.currentBet = raiseAmount;
    updateGameLog(`${player.name} повышает ставку до ${raiseAmount}`);
    // Если ставка на 1 больше, сбрасываем "в тёмную" для всех
    if (raiseAmount > gameState.currentBet + 1) {
        gameState.players.forEach(p => {
            if (p.isBlind) {
                p.isBlind = false;
                updateGameLog(`${p.name} больше не играет в тёмную`);
            }
        });
    }
    checkEndOfRound();
}

function handleBlind() {
    const player = gameState.players[0];
    let blindBet = gameState.currentBet * 2;
    if (blindBet > gameState.maxBet) blindBet = gameState.maxBet;
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
    checkEndOfRound();
}

function handleShowdown() {
    gameState.gamePhase = 'showdown';
    const player = gameState.players[0];
    // Сравниваем с игроком справа (по часовой стрелке)
    let opponentIndex = gameState.currentPlayer - 1;
    if (opponentIndex < 0) opponentIndex = gameState.players.length - 1;
    while (gameState.players[opponentIndex].isFolded && opponentIndex !== gameState.currentPlayer) {
        opponentIndex = opponentIndex - 1 < 0 ? gameState.players.length - 1 : opponentIndex - 1;
    }
    const opponent = gameState.players[opponentIndex];

    const playerPoints = calculatePoints(player.cards);
    const opponentPoints = calculatePoints(opponent.cards);

    updateGameLog(`${player.name} вскрывается против ${opponent.name}`);
    updateGameLog(`${player.name}: ${player.cards.map(c => `${c.rank}${c.suit}`).join(', ')} (${playerPoints} очков)`);
    updateGameLog(`${opponent.name}: ${opponent.cards.map(c => `${c.rank}${c.suit}`).join(', ')} (${opponentPoints} очков)`);

    if (playerPoints > opponentPoints) {
        opponent.isFolded = true;
        updateGameLog(`${player.name} побеждает в вскрытии!`);
    } else if (playerPoints < opponentPoints || playerPoints === opponentPoints) {
        player.isFolded = true;
        updateGameLog(`${opponent.name} побеждает в вскрытии!`);
    }

    checkEndOfRound();
}

// Проверка окончания раунда
function checkEndOfRound() {
    const activePlayers = gameState.players.filter(player => !player.isFolded);
    if (activePlayers.length === 1) {
        // Один игрок остался
        const winner = activePlayers[0];
        winner.chips += gameState.bank;
        updateGameLog(`${winner.name} забирает банк (${gameState.bank})!`);
        startRound();
        return;
    }

    // Переходим к следующему игроку
    nextPlayer();

    // Если все сделали ход, увеличиваем круг торгов
    if (gameState.currentPlayer === (gameState.dealer + 1) % gameState.players.length) {
        gameState.bettingRound++;
        updateGameLog(`Круг торгов ${gameState.bettingRound + 1}`);
    }
}

// Переход к следующему игроку
function nextPlayer() {
    do {
        gameState.currentPlayer = (gameState.currentPlayer + 1) % gameState.players.length;
    } while (gameState.players[gameState.currentPlayer].isFolded);

    updateUI();

    if (gameState.players[gameState.currentPlayer].isBot && gameState.gamePhase === 'betting') {
        setTimeout(() => makeBotMove(), gameState.botDelay);
    }
}

// Ход бота
function makeBotMove() {
    const bot = gameState.players[gameState.currentPlayer];
    const botPoints = calculatePoints(bot.cards);
    const actions = [
        { name: 'fold', weight: botPoints < 15 ? 0.4 : 0.2 },
        { name: 'call', weight: 0.4 },
        { name: 'raise', weight: botPoints > 20 ? 0.3 : 0.1 },
        { name: 'showdown', weight: gameState.bettingRound > 0 && botPoints > 25 ? 0.2 : 0 }
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

    let amount = gameState.currentBet - bot.bet;
    if (bot.isBlind) amount = gameState.currentBet / 2 - bot.bet;

    switch (action) {
        case 'fold':
            bot.isFolded = true;
            updateGameLog(`${bot.name} упал`);
            break;
        case 'call':
            if (amount <= bot.chips) {
                bot.chips -= amount;
                bot.bet += amount;
                gameState.bank += amount;
                updateGameLog(`${bot.name} поддерживает ставку (${amount})`);
            } else {
                bot.isFolded = true;
                updateGameLog(`${bot.name} выбывает из-за нехватки фишек`);
            }
            break;
        case 'raise':
            let raiseAmount = gameState.currentBet * 2;
            if (raiseAmount > gameState.maxBet) raiseAmount = gameState.maxBet;
            let raiseDiff = raiseAmount - bot.bet;
            if (bot.isBlind) raiseDiff = raiseAmount / 2 - bot.bet;
            if (raiseDiff <= bot.chips) {
                bot.chips -= raiseDiff;
                bot.bet += raiseDiff;
                gameState.bank += raiseDiff;
                gameState.currentBet = raiseAmount;
                updateGameLog(`${bot.name} повышает ставку до ${raiseAmount}`);
                gameState.players.forEach(p => {
                    if (p.isBlind) {
                        p.isBlind = false;
                        updateGameLog(`${p.name} больше не играет в тёмную`);
                    }
                });
            } else {
                bot.isFolded = true;
                updateGameLog(`${bot.name} выбывает из-за нехватки фишек`);
            }
            break;
        case 'showdown':
            gameState.gamePhase = 'showdown';
            let opponentIndex = gameState.currentPlayer - 1;
            if (opponentIndex < 0) opponentIndex = gameState.players.length - 1;
            while (gameState.players[opponentIndex].isFolded && opponentIndex !== gameState.currentPlayer) {
                opponentIndex = opponentIndex - 1 < 0 ? gameState.players.length - 1 : opponentIndex - 1;
            }
            const opponent = gameState.players[opponentIndex];
            const botPoints = calculatePoints(bot.cards);
            const opponentPoints = calculatePoints(opponent.cards);
            updateGameLog(`${bot.name} вскрывается против ${opponent.name}`);
            updateGameLog(`${bot.name}: ${bot.cards.map(c => `${c.rank}${c.suit}`).join(', ')} (${botPoints} очков)`);
            updateGameLog(`${opponent.name}: ${opponent.cards.map(c => `${c.rank}${c.suit}`).join(', ')} (${opponentPoints} очков)`);
            if (botPoints > opponentPoints) {
                opponent.isFolded = true;
                updateGameLog(`${bot.name} побеждает в вскрытии!`);
            } else {
                bot.isFolded = true;
                updateGameLog(`${opponent.name} побеждает в вскрытии!`);
            }
            break;
    }

    checkEndOfRound();
}

// Определение победителя (при полном завершении раунда)
function determineWinner() {
    const activePlayers = gameState.players.filter(player => !player.isFolded);
    if (activePlayers.length === 0) {
        updateGameLog('Никто не остался в игре!');
        startRound();
        return;
    }

    const scores = activePlayers.map(player => ({
        player,
        points: calculatePoints(player.cards)
    }));

    const maxPoints = Math.max(...scores.map(s => s.points));
    const winners = scores.filter(s => s.points === maxPoints);

    activePlayers.forEach(player => {
        const cardsStr = player.cards.map(c => `${c.rank}${c.suit}`).join(', ');
        const points = calculatePoints(player.cards);
        updateGameLog(`${player.name} показывает карты: ${cardsStr} (${points} очков)`);
    });

    if (winners.length === 1) {
        const winner = winners[0].player;
        winner.chips += gameState.bank;
        updateGameLog(`${winner.name} побеждает и забирает банк (${gameState.bank})!`);
        startRound();
    } else {
        updateGameLog('Ничья! Начинается свара.');
        startSwara(winners.map(w => w.player));
    }
}

// Свара
function startSwara(winners) {
    gameState.gamePhase = 'swara';
    gameState.isSwara = true;
    gameState.bettingRound = 0;

    // Игроки, не участвующие в сваре, выбывают
    const swaraParticipants = [];
    gameState.players.forEach(player => {
        if (winners.includes(player)) {
            swaraParticipants.push(player);
            player.isFolded = false;
            player.isBlind = false; // Нет игры "в тёмную" в сваре
        } else if (!player.isFolded) {
            // Игроки, дошедшие до конца, могут участвовать за ½ банка
            const entryFee = gameState.bank / 2;
            if (player.chips >= entryFee) {
                player.chips -= entryFee;
                gameState.bank += entryFee;
                swaraParticipants.push(player);
                player.isFolded = false;
                player.isBlind = false;
                updateGameLog(`${player.name} присоединяется к сваре за ${entryFee}`);
            } else {
                player.isFolded = true;
            }
        } else {
            player.isFolded = true;
        }
    });

    gameState.players = swaraParticipants;
    if (gameState.players.length === 0) {
        updateGameLog('Никто не участвует в сваре!');
        startRound();
        return;
    }

    gameState.deck = createDeck();
    shuffleDeck(gameState.deck);
    dealCards();
    updateGameLog('Карты для свары розданы!');
    gameState.currentPlayer = 0;
    gameState.currentBet = gameState.baseBet;
    startBetting();
}

// Обновление лога
function updateGameLog(message, isError = false) {
    const logElement = document.getElementById('game-log');
    const messageElement = document.createElement('p');
    messageElement.textContent = message;
    if (isError) messageElement.style.color = '#e74c3c';
    logElement.appendChild(messageElement);
    logElement.scrollTop = logElement.scrollHeight;
}

// Инициализация игры
function initGame() {
    console.log('Запускаю initGame');
    const playerName = tg?.initDataUnsafe?.user?.first_name || 'Вы';
    gameState.players = [
        { id: 1, name: playerName, chips: 1000, cards: [], isFolded: false, isBot: false, isBlind: false, bet: 0 },
        { id: 2, name: 'Алексей', chips: 1000, cards: [], isFolded: false, isBot: true, isBlind: false, bet: 0 },
        { id: 3, name: 'Мария', chips: 1000, cards: [], isFolded: false, isBot: true, isBlind: false, bet: 0 }
    ];

    chooseDealer();
}
