// Инициализация Telegram WebApp
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.expand();
    tg.enableClosingConfirmation();
}

// Состояние игры
const gameState = {
    players: [], // Активные игроки
    droppedPlayers: [], // Выбывшие игроки (для свары)
    deck: [], // Колода карт
    bank: 0, // Банк игры
    currentBet: 0, // Текущая ставка
    currentPlayer: 0, // Текущий игрок (индекс)
    dealer: 0, // Индекс раздающего
    gamePhase: 'waiting', // waiting, dealing, betting, showdown, swara, split
    baseBet: 50, // Обязательная ставка
    maxBet: 1000, // Потолок ставки
    botDelay: 1500, // Задержка хода бота
    bettingRound: 0, // Круг торгов
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

// Выбор раздающего
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
    console.log('Начинаю новый раунд');
    gameState.gamePhase = 'dealing';
    gameState.bank = 0;
    gameState.currentBet = gameState.baseBet;
    gameState.currentPlayer = (gameState.dealer + 1) % gameState.players.length;
    gameState.bettingRound = 0;
    gameState.isSwara = false;

    gameState.droppedPlayers = [];
    gameState.players.forEach(player => {
        player.cards = [];
        player.isFolded = false;
        player.isBlind = false;
        player.bet = 0;
    });

    gameState.deck = createDeck();
    shuffleDeck(gameState.deck);

    gameState.players.forEach(player => {
        if (player.chips >= gameState.baseBet) {
            player.chips -= gameState.baseBet;
            player.bet = gameState.baseBet;
            gameState.bank += gameState.baseBet;
            updateGameLog(`${player.name} вносит обязательную ставку (${gameState.baseBet})`);
        } else {
            player.isFolded = true;
            gameState.droppedPlayers.push({ ...player });
            updateGameLog(`${player.name} выбывает из-за нехватки фишек`);
        }
    });

    dealCards();
    updateGameLog('Карты розданы!');
    console.log('Карты розданы:', gameState.players.map(p => ({ name: p.name, cards: p.cards })));
    startBetting();
}

// Раздача карт
function dealCards() {
    console.log('Раздаю карты');
    if (gameState.deck.length < gameState.players.length * 3) {
        console.error('Недостаточно карт в колоде для раздачи!');
        return;
    }
    for (let i = 0; i < 3; i++) {
        for (const player of gameState.players) {
            if (!player.isFolded && gameState.deck.length > 0) {
                player.cards.push(gameState.deck.pop());
            }
        }
    }
}

// Начало торгов
function startBetting() {
    gameState.gamePhase = 'betting';
    const currentPlayer = gameState.players[gameState.currentPlayer];
    if (!currentPlayer || currentPlayer.isFolded) {
        console.warn('Текущий игрок отсутствует или сброшен, перехожу к следующему');
        nextPlayer();
        return;
    }
    console.log(`Начинаю торги, текущий игрок: ${currentPlayer.name}`);
    updateUI();
    updateGameLog(`Круг торгов ${gameState.bettingRound + 1}`);
    if (currentPlayer.isBot) {
        setTimeout(() => makeBotMove(), gameState.botDelay);
    }
}

// Подсчёт очков игрока
function calculatePoints(cards) {
    if (!cards || cards.length === 0) return 0;
    const hasJoker = cards.some(card => card.isJoker);
    const nonJokerCards = cards.filter(card => !card.isJoker);

    const aceCount = cards.filter(card => card.rank === 'A').length;
    if (aceCount >= 2) {
        return 22;
    }

    const sameRank = nonJokerCards.every(card => card.rank === nonJokerCards[0]?.rank);
    if (sameRank || (hasJoker && nonJokerCards.length === 2 && nonJokerCards[0].rank === nonJokerCards[1].rank)) {
        const rank = nonJokerCards[0]?.rank || cards[0].rank;
        if (rank === '6') {
            return 34;
        }
        return cards.reduce((sum, card) => sum + (card.isJoker ? nonJokerCards[0].value : card.value), 0);
    }

    const suits = {};
    cards.forEach(card => {
        if (!card.isJoker) {
            suits[card.suit] = suits[card.suit] || [];
            suits[card.suit].push(card.value);
        }
    });

    if (hasJoker) {
        const maxSuit = Object.keys(suits).reduce((a, b) => suits[a].length > suits[b].length ? a : b, Object.keys(suits)[0]);
        suits[maxSuit] = suits[maxSuit] || [];
        suits[maxSuit].push(11);
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
    if (!player) {
        console.error('Игрок с индексом 0 отсутствует!');
        return;
    }

    if (player.isBlind) {
        for (let i = 0; i < 3; i++) {
            const cardElement = document.createElement('div');
            cardElement.className = 'card back';
            cardElement.textContent = '🂠';
            container.appendChild(cardElement);
        }
    } else if (player.cards && player.cards.length === 3) {
        player.cards.forEach(card => {
            const cardElement = createCardElement(card);
            container.appendChild(cardElement);
        });
    } else {
        console.warn('Карты игрока отсутствуют или некорректны, рендер пропущен');
    }

    const comboContainer = document.getElementById('player-combo');
    if (!player.isBlind && player.cards && player.cards.length === 3) {
        const points = calculatePoints(player.cards);
        comboContainer.textContent = `Ваша комбинация: ${player.cards.map(c => `${c.rank}${c.suit}`).join(', ')} (${points} очков)`;
    } else {
        comboContainer.textContent = 'Вы играете в тёмную';
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
        if (!player) continue;
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
    const player = gameState.players[0];
    if (!player) {
        console.error('Игрок с индексом 0 отсутствует при обновлении UI!');
        return;
    }
    document.getElementById('player-name').textContent = player.name;
    document.getElementById('player-chips').textContent = `${player.chips} фишек`;
}

// Отрисовка действий
function renderActions() {
    const container = document.getElementById('actions');
    container.innerHTML = '';

    const currentPlayer = gameState.players[gameState.currentPlayer];
    if (!currentPlayer || currentPlayer.isFolded || gameState.gamePhase === 'split') {
        return;
    }

    if (gameState.gamePhase === 'betting') {
        const foldBtn = document.createElement('button');
        foldBtn.className = 'action-btn fold-btn';
        foldBtn.textContent = 'Упасть';
        foldBtn.onclick = () => handleFold();
        container.appendChild(foldBtn);

        if (currentPlayer.isBlind) {
            const seeBtn = document.createElement('button');
            seeBtn.className = 'action-btn check-btn';
            seeBtn.textContent = 'Смотреть';
            seeBtn.onclick = () => handleSee();
            container.appendChild(seeBtn);
        }

        const callBtn = document.createElement('button');
        callBtn.className = 'action-btn check-btn';
        callBtn.textContent = 'Поддержать';
        callBtn.onclick = () => handleCall();
        container.appendChild(callBtn);

        const raiseBtn = document.createElement('button');
        raiseBtn.className = 'action-btn bet-btn';
        raiseBtn.textContent = 'Повысить';
        raiseBtn.onclick = () => handleRaise();
        container.appendChild(raiseBtn);

        if (gameState.bettingRound > 0) {
            const showdownBtn = document.createElement('button');
            showdownBtn.className = 'action-btn raise-btn';
            showdownBtn.textContent = 'Вскрыться';
            showdownBtn.onclick = () => handleShowdown();
            container.appendChild(showdownBtn);
        }

        if (!currentPlayer.isBlind && !gameState.isSwara && gameState.currentPlayer === (gameState.dealer + 1) % gameState.players.length) {
            const blindBtn = document.createElement('button');
            blindBtn.className = 'action-btn raise-btn';
            blindBtn.textContent = 'В тёмную';
            blindBtn.onclick = () => handleBlind();
            container.appendChild(blindBtn);
        }
    } else if (gameState.gamePhase === 'showdown') {
        const swaraBtn = document.createElement('button');
        swaraBtn.className = 'action-btn bet-btn';
        swaraBtn.textContent = 'Свара';
        swaraBtn.onclick = () => startSwara(gameState.showdownWinners.map(w => w.player));
        container.appendChild(swaraBtn);

        const splitBtn = document.createElement('button');
        splitBtn.className = 'action-btn check-btn';
        splitBtn.textContent = 'Поделить банк';
        splitBtn.onclick = () => handleSplitBank();
        container.appendChild(splitBtn);
    }
}

// Обработчики действий
function handleFold() {
    const player = gameState.players[0];
    if (!player) return;
    player.isFolded = true;
    gameState.droppedPlayers.push({ ...player });
    gameState.players = gameState.players.filter(p => !p.isFolded);
    updateGameLog(`${player.name} упал`);
    checkEndOfRound();
}

function handleSee() {
    const player = gameState.players[0];
    if (!player) return;
    player.isBlind = false;
    updateGameLog(`${player.name} посмотрел свои карты`);
    updateUI();
    nextPlayer();
}

function handleCall() {
    const player = gameState.players[0];
    if (!player) return;
    const hasBlindPlayer = gameState.players.some(p => p.isBlind && !p.isFolded);
    let amount = gameState.currentBet - player.bet;
    if (hasBlindPlayer && !player.isBlind) {
        amount = (gameState.currentBet * 2) - player.bet;
    }
    if (amount > player.chips) {
        updateGameLog(`${player.name} выбывает из-за нехватки фишек`);
        player.isFolded = true;
        gameState.droppedPlayers.push({ ...player });
        gameState.players = gameState.players.filter(p => !p.isFolded);
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
    if (!player) return;
    const hasBlindPlayer = gameState.players.some(p => p.isBlind && !p.isFolded);
    let raiseAmount = gameState.currentBet + 10;
    if (hasBlindPlayer && !player.isBlind) {
        raiseAmount = (gameState.currentBet * 2) + 10;
    }
    if (raiseAmount > gameState.maxBet) raiseAmount = gameState.maxBet;
    let amount = raiseAmount - player.bet;

    if (amount > player.chips) {
        updateGameLog('Недостаточно фишек!', true);
        return;
    }
    player.chips -= amount;
    player.bet += amount;
    gameState.bank += amount;
    gameState.currentBet = raiseAmount;
    updateGameLog(`${player.name} повышает ставку до ${raiseAmount}`);
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
    if (!player) return;
    let blindBet = gameState.currentBet + 10;
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
    const player = gameState.players[0];
    if (!player) return;
    gameState.gamePhase = 'showdown';
    let opponentIndex = gameState.currentPlayer - 1;
    if (opponentIndex < 0) opponentIndex = gameState.players.length - 1;
    while (gameState.players[opponentIndex]?.isFolded && opponentIndex !== gameState.currentPlayer) {
        opponentIndex = opponentIndex - 1 < 0 ? gameState.players.length - 1 : opponentIndex - 1;
    }
    const opponent = gameState.players[opponentIndex];
    if (!opponent) {
        console.error('Противник не найден для вскрытия!');
        return;
    }
    const hasBlindPlayer = gameState.players.some(p => p.isBlind && !p.isFolded);
    let amount = opponent.bet - player.bet;
    if (hasBlindPlayer && !player.isBlind) {
        amount = (opponent.bet * 2) - player.bet;
    }
    if (amount > player.chips) {
        updateGameLog(`${player.name} выбывает из-за нехватки фишек`);
        player.isFolded = true;
        gameState.droppedPlayers.push({ ...player });
        gameState.players = gameState.players.filter(p => !p.isFolded);
        checkEndOfRound();
        return;
    }
    player.chips -= amount;
    player.bet += amount;
    gameState.bank += amount;
    updateGameLog(`${player.name} уравнивает ставку (${amount})`);

    const playerPoints = calculatePoints(player.cards);
    const opponentPoints = calculatePoints(opponent.cards);

    updateGameLog(`${player.name} вскрывается против ${opponent.name}`);
    updateGameLog(`${player.name}: ${player.cards.map(c => `${c.rank}${c.suit}`).join(', ')} (${playerPoints} очков)`);
    updateGameLog(`${opponent.name}: ${opponent.cards.map(c => `${c.rank}${c.suit}`).join(', ')} (${opponentPoints} очков)`);

    if (playerPoints > opponentPoints) {
        opponent.isFolded = true;
        gameState.droppedPlayers.push({ ...opponent });
        gameState.players = gameState.players.filter(p => !p.isFolded);
        updateGameLog(`${player.name} побеждает в вскрытии!`);
    } else if (playerPoints < opponentPoints) {
        player.isFolded = true;
        gameState.droppedPlayers.push({ ...player });
        gameState.players = gameState.players.filter(p => !p.isFolded);
        updateGameLog(`${opponent.name} побеждает в вскрытии!`);
    } else {
        player.isFolded = true;
        gameState.droppedPlayers.push({ ...player });
        gameState.players = gameState.players.filter(p => !p.isFolded);
        updateGameLog('Равные очки! Выбывает вскрывающийся.');
    }

    checkEndOfRound();
}

function handleSplitBank() {
    const activePlayers = gameState.players.filter(player => !player.isFolded);
    if (activePlayers.length === 0) {
        console.error('Нет активных игроков для разделения банка!');
        return;
    }
    const share = Math.floor(gameState.bank / activePlayers.length);
    activePlayers.forEach(player => {
        player.chips += share;
        updateGameLog(`${player.name} получает долю банка (${share})`);
    });
    startRound();
}

// Проверка окончания раунда
function checkEndOfRound() {
    const activePlayers = gameState.players.filter(player => !player.isFolded);
    console.log('Проверяю конец раунда, активные игроки:', activePlayers.map(p => p.name));
    if (activePlayers.length === 1) {
        const winner = activePlayers[0];
        winner.chips += gameState.bank;
        updateGameLog(`${winner.name} забирает банк (${gameState.bank})!`);
        startRound();
        return;
    }

    if (activePlayers.length === 0) {
        updateGameLog('Никто не остался в игре!');
        startRound();
        return;
    }

    nextPlayer();

    if (gameState.currentPlayer === (gameState.dealer + 1) % gameState.players.length) {
        gameState.bettingRound++;
        updateGameLog(`Круг торгов ${gameState.bettingRound + 1}`);
        determineWinner();
    }
}

// Переход к следующему игроку
function nextPlayer() {
    const activePlayers = gameState.players.filter(player => !player.isFolded);
    if (activePlayers.length <= 1) {
        console.log('Остался один игрок или меньше, завершаю раунд');
        determineWinner();
        return;
    }

    let nextIndex = (gameState.currentPlayer + 1) % gameState.players.length;
    let attempts = 0;
    while (gameState.players[nextIndex]?.isFolded && attempts < gameState.players.length) {
        nextIndex = (nextIndex + 1) % gameState.players.length;
        attempts++;
    }

    if (attempts >= gameState.players.length) {
        console.error('Не удалось найти следующего игрока!');
        determineWinner();
        return;
    }

    gameState.currentPlayer = nextIndex;
    console.log(`Переход к следующему игроку: ${gameState.players[gameState.currentPlayer].name}`);

    updateUI();

    if (gameState.players[gameState.currentPlayer].isBot && gameState.gamePhase === 'betting') {
        setTimeout(() => makeBotMove(), gameState.botDelay);
    }
}

// Ход бота
function makeBotMove() {
    const bot = gameState.players[gameState.currentPlayer];
    if (!bot) {
        console.error('Бот отсутствует при попытке хода!');
        checkEndOfRound();
        return;
    }

    console.log(`Ход бота ${bot.name}, фишки: ${bot.chips}, ставка: ${bot.bet}, текущая ставка: ${gameState.currentBet}`);
    const botPoints = calculatePoints(bot.cards || []);
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

    const hasBlindPlayer = gameState.players.some(p => p.isBlind && !p.isFolded);
    let amount = gameState.currentBet - bot.bet;
    if (hasBlindPlayer && !bot.isBlind) {
        amount = (gameState.currentBet * 2) - bot.bet;
    }

    switch (action) {
        case 'fold':
            bot.isFolded = true;
            gameState.droppedPlayers.push({ ...bot });
            gameState.players = gameState.players.filter(p => !p.isFolded);
            updateGameLog(`${bot.name} упал`);
            break;
        case 'call':
            if (amount <= bot.chips && amount >= 0) {
                bot.chips -= amount;
                bot.bet += amount;
                gameState.bank += amount;
                updateGameLog(`${bot.name} поддерживает ставку (${amount})`);
            } else {
                bot.isFolded = true;
                gameState.droppedPlayers.push({ ...bot });
                gameState.players = gameState.players.filter(p => !p.isFolded);
                updateGameLog(`${bot.name} выбывает из-за нехватки фишек`);
            }
            break;
        case 'raise':
            let raiseAmount = gameState.currentBet + 10;
            if (hasBlindPlayer && !bot.isBlind) {
                raiseAmount = (gameState.currentBet * 2) + 10;
            }
            if (raiseAmount > gameState.maxBet) raiseAmount = gameState.maxBet;
            let raiseDiff = raiseAmount - bot.bet;
            if (raiseDiff <= bot.chips && raiseDiff >= 0) {
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
                gameState.droppedPlayers.push({ ...bot });
                gameState.players = gameState.players.filter(p => !p.isFolded);
                updateGameLog(`${bot.name} выбывает из-за нехватки фишек`);
            }
            break;
        case 'showdown':
            gameState.gamePhase = 'showdown';
            let opponentIndex = gameState.currentPlayer - 1;
            if (opponentIndex < 0) opponentIndex = gameState.players.length - 1;
            while (gameState.players[opponentIndex]?.isFolded && opponentIndex !== gameState.currentPlayer) {
                opponentIndex = opponentIndex - 1 < 0 ? gameState.players.length - 1 : opponentIndex - 1;
            }
            const opponent = gameState.players[opponentIndex];
            if (!opponent) {
                console.error('Противник не найден для вскрытия бота!');
                bot.isFolded = true;
                gameState.droppedPlayers.push({ ...bot });
                gameState.players = gameState.players.filter(p => !p.isFolded);
                break;
            }
            let showdownAmount = opponent.bet - bot.bet;
            if (hasBlindPlayer && !bot.isBlind) {
                showdownAmount = (opponent.bet * 2) - bot.bet;
            }
            if (showdownAmount <= bot.chips && showdownAmount >= 0) {
                bot.chips -= showdownAmount;
                bot.bet += showdownAmount;
                gameState.bank += showdownAmount;
                updateGameLog(`${bot.name} уравнивает ставку (${showdownAmount})`);
            } else {
                bot.isFolded = true;
                gameState.droppedPlayers.push({ ...bot });
                gameState.players = gameState.players.filter(p => !p.isFolded);
                updateGameLog(`${bot.name} выбывает из-за нехватки фишек`);
                break;
            }
            const botPoints = calculatePoints(bot.cards || []);
            const opponentPoints = calculatePoints(opponent.cards || []);
            updateGameLog(`${bot.name} вскрывается против ${opponent.name}`);
            updateGameLog(`${bot.name}: ${bot.cards.map(c => `${c.rank}${c.suit}`).join(', ')} (${botPoints} очков)`);
            updateGameLog(`${opponent.name}: ${opponent.cards.map(c => `${c.rank}${c.suit}`).join(', ')} (${opponentPoints} очков)`);
            if (botPoints > opponentPoints) {
                opponent.isFolded = true;
                gameState.droppedPlayers.push({ ...opponent });
                gameState.players = gameState.players.filter(p => !p.isFolded);
                updateGameLog(`${bot.name} побеждает в вскрытии!`);
            } else if (botPoints < opponentPoints) {
                bot.isFolded = true;
                gameState.droppedPlayers.push({ ...bot });
                gameState.players = gameState.players.filter(p => !p.isFolded);
                updateGameLog(`${opponent.name} побеждает в вскрытии!`);
            } else {
                bot.isFolded = true;
                gameState.droppedPlayers.push({ ...bot });
                gameState.players = gameState.players.filter(p => !p.isFolded);
                updateGameLog('Равные очки! Выбывает вскрывающийся.');
            }
            break;
    }

    checkEndOfRound();
}

// Определение победителя
function determineWinner() {
    const activePlayers = gameState.players.filter(player => !player.isFolded);
    if (activePlayers.length === 1) {
        const winner = activePlayers[0];
        winner.chips += gameState.bank;
        updateGameLog(`${winner.name} забирает банк (${gameState.bank})!`);
        startRound();
        return;
    }

    const scores = activePlayers.map(player => ({
        player,
        points: calculatePoints(player.cards || [])
    }));

    const maxPoints = Math.max(...scores.map(s => s.points));
    const winners = scores.filter(s => s.points === maxPoints);

    activePlayers.forEach(player => {
        const cardsStr = (player.cards || []).map(c => `${c.rank}${c.suit}`).join(', ') || 'Нет карт';
        const points = calculatePoints(player.cards || []);
        updateGameLog(`${player.name} показывает карты: ${cardsStr} (${points} очков)`);
    });

    if (winners.length === 1) {
        const winner = winners[0].player;
        winner.chips += gameState.bank;
        updateGameLog(`${winner.name} побеждает и забирает банк (${gameState.bank})!`);
        startRound();
    } else {
        updateGameLog('Ничья! Выберите действие:');
        gameState.gamePhase = 'showdown';
        gameState.showdownWinners = winners;
        updateUI();
    }
}

// Свара
function startSwara(winners) {
    gameState.gamePhase = 'swara';
    gameState.isSwara = true;
    gameState.bettingRound = 0;

    const swaraParticipants = [];
    winners.forEach(winner => {
        winner.isFolded = false;
        winner.isBlind = false;
        swaraParticipants.push(winner);
    });

    gameState.droppedPlayers.forEach(player => {
        const entryFee = gameState.bank / 2;
        if (player.chips >= entryFee) {
            player.chips -= entryFee;
            gameState.bank += entryFee;
            player.cards = [];
            player.isFolded = false;
            player.isBlind = false;
            player.bet = 0;
            swaraParticipants.push(player);
            updateGameLog(`${player.name} присоединяется к сваре за ${entryFee}`);
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
