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
    bettingRound: 0, // Круг торгов
    isSwara: false, // Флаг свары
    minPlayers: 2, // Минимальное количество игроков
    invitedPlayers: new Set(), // Множество приглашённых игроков
};

// Инициализация игры после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM загружен, начинаю настройку игры');
    initGame();
});

function initGame() {
    const user = tg?.initDataUnsafe?.user;
    if (!user) {
        alert('Не удалось определить пользователя!');
        return;
    }

    const playerName = user.first_name || `Игрок_${user.id}`;
    gameState.players.push({ id: user.id, name: playerName, chips: 1000, cards: [], isFolded: false, isBlind: false, bet: 0 });

    const setupDiv = document.createElement('div');
    setupDiv.id = 'game-setup';
    setupDiv.innerHTML = `
        <h2>Картойная игра</h2>
        <p>Вы: ${playerName}</p>
        <p>Ожидание других игроков...</p>
        <button onclick="invitePlayers()">Пригласить друзей</button>
        <button onclick="startGameIfReady()">Начать игру</button>
    `;
    document.body.appendChild(setupDiv);

    // Периодическая проверка подключения игроков (симуляция)
    setInterval(checkPlayerResponses, 5000);
}

// Приглашение игроков
function invitePlayers() {
    const inviteMessage = JSON.stringify({
        action: 'invite',
        gameId: Date.now(), // Уникальный идентификатор игры
        host: gameState.players[0].id
    });
    tg.sendData(inviteMessage);
    updateGameLog('Приглашение отправлено другим игрокам!');
}

// Проверка ответов от игроков
function checkPlayerResponses() {
    if (tg.initDataUnsafe && tg.initDataUnsafe.start_param) {
        const data = JSON.parse(decodeURIComponent(tg.initDataUnsafe.start_param));
        if (data.action === 'join' && !gameState.invitedPlayers.has(data.playerId)) {
            gameState.invitedPlayers.add(data.playerId);
            gameState.players.push({ id: data.playerId, name: data.playerName || `Игрок_${data.playerId}`, chips: 1000, cards: [], isFolded: false, isBlind: false, bet: 0 });
            updateGameLog(`${data.playerName || `Игрок_${data.playerId}`} присоединился к игре!`);
            updateSetupUI();
        }
    }
}

// Начать игру, если достаточно игроков
function startGameIfReady() {
    if (gameState.players.length >= gameState.minPlayers) {
        gameState.initialPlayers = JSON.parse(JSON.stringify(gameState.players));
        document.getElementById('game-setup').remove();
        chooseDealer();
    } else {
        alert(`Нужно минимум ${gameState.minPlayers} игрока(ов), текущих: ${gameState.players.length}`);
    }
}

// Обновление интерфейса настройки
function updateSetupUI() {
    const setupDiv = document.getElementById('game-setup');
    if (setupDiv) {
        setupDiv.innerHTML = `
            <h2>Картойная игра</h2>
            <p>Вы: ${gameState.players[0].name}</p>
            <p>Игроки: ${gameState.players.map(p => p.name).join(', ')}</p>
            <button onclick="invitePlayers()">Пригласить друзей</button>
            <button onclick="startGameIfReady()">Начать игру</button>
        `;
    }
}

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

    // Восстановление игроков из начального списка
    gameState.players = JSON.parse(JSON.stringify(gameState.initialPlayers));
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

    // Фильтрация игроков после обязательных ставок
    const activePlayers = gameState.players.filter(player => !player.isFolded);
    if (activePlayers.length <= 1) {
        if (activePlayers.length === 1) {
            const winner = activePlayers[0];
            winner.chips += gameState.bank;
            updateGameLog(`${winner.name} забирает банк (${gameState.bank})!`);
        } else {
            updateGameLog('Никто не может продолжить игру!');
        }
        startRound();
        return;
    }

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

    // Отправка данных текущему игроку (для синхронизации)
    const gameStateData = JSON.stringify({
        action: 'turn',
        currentPlayer: currentPlayer.id,
        bank: gameState.bank,
        currentBet: gameState.currentBet
    });
    tg.sendData(gameStateData);
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
    syncGameState();
    checkEndOfRound();
}

function handleSee() {
    const player = gameState.players[0];
    if (!player) return;
    player.isBlind = false;
    updateGameLog(`${player.name} посмотрел свои карты`);
    updateUI();
    syncGameState();
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
        syncGameState();
        checkEndOfRound();
        return;
    }
    player.chips -= amount;
    player.bet += amount;
    gameState.bank += amount;
    updateGameLog(`${player.name} поддерживает ставку (${amount})`);
    syncGameState();
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
    syncGameState();
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
    syncGameState();
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
        syncGameState();
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

    syncGameState();
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
    syncGameState();
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
        syncGameState();
        startRound();
        return;
    }

    if (activePlayers.length === 0) {
        updateGameLog('Никто не остался в игре!');
        syncGameState();
        startRound();
        return;
    }

    nextPlayer();
}

// Переход к следующему игроку
function nextPlayer() {
    const activePlayers = gameState.players.filter(player => !player.isFolded);
    if (activePlayers.length <= 1) {
        console.log('Остался один игрок или меньше, завершаю раунд');
        checkEndOfRound();
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
        checkEndOfRound();
        return;
    }

    gameState.currentPlayer = nextIndex;
    console.log(`Переход к следующему игроку: ${gameState.players[gameState.currentPlayer].name}`);

    updateUI();
    syncGameState();
}

// Синхронизация состояния игры
function syncGameState() {
    const gameStateData = JSON.stringify({
        action: 'sync',
        players: gameState.players,
        bank: gameState.bank,
        currentBet: gameState.currentBet,
        currentPlayer: gameState.currentPlayer,
        gamePhase: gameState.gamePhase
    });
    tg.sendData(gameStateData);
}

// Определение победителя
function determineWinner() {
    const activePlayers = gameState.players.filter(player => !player.isFolded);
    if (activePlayers.length === 1) {
        const winner = activePlayers[0];
        winner.chips += gameState.bank;
        updateGameLog(`${winner.name} забирает банк (${gameState.bank})!`);
        syncGameState();
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
        syncGameState();
        startRound();
    } else {
        updateGameLog('Ничья! Выберите действие:');
        gameState.gamePhase = 'showdown';
        gameState.showdownWinners = winners;
        syncGameState();
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
        syncGameState();
        startRound();
        return;
    }

    gameState.deck = createDeck();
    shuffleDeck(gameState.deck);
    dealCards();
    updateGameLog('Карты для свары розданы!');
    gameState.currentPlayer = 0;
    gameState.currentBet = gameState.baseBet;
    syncGameState();
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
