// Простейшая рабочая версия игры
document.addEventListener('DOMContentLoaded', function() {
    console.log('Скрипт начал выполняться');
    
    // Проверяем Telegram WebApp
    const tg = window.Telegram?.WebApp;
    if (tg) {
        tg.expand();
        console.log('Telegram WebApp инициализирован');
    } else {
        console.log('Режим тестирования в браузере');
    }

    // Инициализация игры
    initGame();
});

function initGame() {
    console.log('Инициализация игры');
    
    // Простое состояние игры
    const gameState = {
        players: [
            { name: 'Вы', chips: 1000, cards: [] },
            { name: 'Игрок 2', chips: 1000, cards: [] }
        ],
        bank: 0,
        deck: createDeck(),
        currentPlayer: 0
    };

    // Раздаем карты
    dealCards(gameState);
    
    // Обновляем интерфейс
    updateUI(gameState);
    
    console.log('Игра инициализирована', gameState);
}

function createDeck() {
    const suits = ['♥', '♦', '♣', '♠'];
    const ranks = ['10', 'J', 'Q', 'K', 'A'];
    const deck = [];
    
    for (const suit of suits) {
        for (const rank of ranks) {
            deck.push({ suit, rank });
        }
    }
    
    // Добавляем джокера
    deck.push({ suit: '★', rank: 'Joker' });
    
    return shuffleDeck(deck);
}

function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function dealCards(gameState) {
    // Раздаем по 3 карты каждому игроку
    for (let i = 0; i < 3; i++) {
        for (const player of gameState.players) {
            if (gameState.deck.length > 0) {
                player.cards.push(gameState.deck.pop());
            }
        }
    }
}

function updateUI(gameState) {
    console.log('Обновление интерфейса');
    
    // Показываем карты первого игрока (ваши)
    const cardsContainer = document.getElementById('player-cards');
    cardsContainer.innerHTML = '';
    
    gameState.players[0].cards.forEach(card => {
        const cardElement = document.createElement('div');
        cardElement.className = 'card';
        cardElement.textContent = `${card.rank}${card.suit}`;
        cardsContainer.appendChild(cardElement);
    });
    
    // Обновляем банк
    document.getElementById('bank').textContent = `Банк: ${gameState.bank}`;
    
    // Показываем кнопки действий
    const actionsContainer = document.getElementById('actions');
    actionsContainer.innerHTML = '';
    
    const actions = [
        { text: 'Сбросить', action: 'fold' },
        { text: 'Проверить', action: 'check' },
        { text: 'Ставка 10', action: 'bet' }
    ];
    
    actions.forEach(btn => {
        const button = document.createElement('button');
        button.textContent = btn.text;
        button.onclick = () => handleAction(btn.action, gameState);
        actionsContainer.appendChild(button);
    });
    
    // Обновляем статус
    document.getElementById('game-state').textContent = 'Ваш ход';
}

function handleAction(action, gameState) {
    console.log('Действие:', action);
    
    let message = '';
    switch (action) {
        case 'fold':
            message = 'Вы сбросили карты';
            break;
        case 'check':
            message = 'Вы проверяете';
            break;
        case 'bet':
            gameState.bank += 10;
            gameState.players[0].chips -= 10;
            message = 'Вы сделали ставку 10';
            break;
    }
    
    alert(message);
    updateUI(gameState);
}
