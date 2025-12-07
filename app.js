// Game State
const equipmentData = window.equipmentData;

// Country Name Normalization Mapping
const COUNTRY_ALIASES = {
    "United States": ["United States of America", "USA", "United States", "US"],
    "United Kingdom": ["United Kingdom", "Great Britain", "UK", "Britain"],
    "Russia": ["Russian Federation", "Russia"],
    "Turkey": ["Turkey", "Türkiye", "Republic of Turkey"],
    "Israel": ["Israel", "State of Israel"],
    "France": ["France", "French Republic"],
    "Germany": ["Germany", "Federal Republic of Germany"],
    "Sweden": ["Sweden", "Kingdom of Sweden"],
    "China": ["China", "People's Republic of China"],
    "India": ["India", "Republic of India"]
};

let state = {
    score: 0,
    round: 1,
    maxRounds: 5,
    currentEquipment: null,
    userGuess: null,
    selectedCountry: null,
    hoveredCountry: null,
    map: null,
    bgLayer: null,
    marker: null,
    actualMarker: null,
    geoJsonLayer: null,
    mapDataLoaded: false,
    bonusSubmitted: false,
    roundResults: [],  // Track results for each round
    currentRoundResult: null,  // Track current round's result before bonus
    isDailyMode: false,  // Daily challenge mode
    playerName: ''  // Player name for daily leaderboard
};

// DOM Elements
const screens = {
    start: document.getElementById('start-screen'),
    practice: document.getElementById('practice-screen'),
    game: document.getElementById('game-screen'),
    result: document.getElementById('result-screen'),
    gameOver: document.getElementById('game-over-screen')
};

const dom = {
    score: document.getElementById('score'),
    round: document.getElementById('round'),
    image: document.getElementById('equipment-image'),
    guessBtn: document.getElementById('guess-btn'),
    equipmentPopup: document.getElementById('equipment-popup'),
    closeEquipmentBtn: document.getElementById('close-equipment'),
    equipmentThumbnail: document.getElementById('equipment-thumbnail'),
    thumbnailImage: document.getElementById('thumbnail-image'),
    specs: {
        container: document.getElementById('specs-container'),
        speed: document.getElementById('spec-speed'),
        armament: document.getElementById('spec-armament'),
        range: document.getElementById('spec-range')
    },
    resultDetails: {
        origin: document.getElementById('actual-origin'),
        distance: document.getElementById('distance-error'),
        points: document.getElementById('points-awarded')
    },
    finalScore: document.getElementById('final-score'),
    bonus: {
        section: document.getElementById('bonus-section'),
        choices: document.getElementById('bonus-choices'),
        result: document.getElementById('bonus-result')
    },
    summary: {
        section: document.getElementById('equipment-summary'),
        year: document.getElementById('summary-year'),
        status: document.getElementById('summary-status'),
        users: document.getElementById('summary-users')
    }
};

// Initialization
function init() {
    setupEventListeners();
    initMap();
    setupDailyChallenge();
    refreshLeaderboardPreview();
    registerServiceWorker();
    console.log("Defence Guesser Initialized");
}

// PWA Service Worker Registration
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => {
                    console.log('[PWA] Service Worker registered:', registration.scope);
                })
                .catch(error => {
                    console.warn('[PWA] Service Worker registration failed:', error);
                });
        });
    }
}

// PWA Install Prompt (optional - for custom install button)
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent Chrome 67 and earlier from automatically showing the prompt
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e;
    console.log('[PWA] Install prompt available');
});

function setupEventListeners() {
    document.getElementById('start-btn').addEventListener('click', () => startGame(false));
    document.getElementById('guess-btn').addEventListener('click', submitGuess);
    document.getElementById('next-btn').addEventListener('click', nextRound);
    document.getElementById('restart-btn').addEventListener('click', () => {
        if (state.isDailyMode) {
            switchScreen('start');
        } else {
            startGame(false);
        }
    });
    document.getElementById('menu-btn').addEventListener('click', () => {
        refreshLeaderboardPreview();
        switchScreen('start');
    });

    // Equipment popup minimize/maximize
    dom.closeEquipmentBtn.addEventListener('click', minimizeEquipment);
    dom.equipmentThumbnail.addEventListener('click', maximizeEquipment);

    // Practice Hub event listeners
    setupPracticeHub();
}

// Equipment Popup Controls
function minimizeEquipment() {
    dom.equipmentPopup.classList.add('minimized');
    dom.equipmentThumbnail.classList.remove('hidden');
}

function maximizeEquipment() {
    dom.equipmentPopup.classList.remove('minimized');
    dom.equipmentThumbnail.classList.add('hidden');
}

// Map Logic & Data
function initMap() {
    if (state.map) return;

    state.map = L.map('map', {
        center: [20, 0],
        zoom: 2,
        minZoom: 2,
        maxBounds: [[-90, -180], [90, 180]]
    });

    state.bgLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(state.map);

    state.map.on('click', (e) => handleMapInteraction(e, null));

    loadCountryData();
}

async function loadCountryData() {
    if (window.countryBoundaryData) {
        processGeoJSON(window.countryBoundaryData);
    } else {
        try {
            const response = await fetch('assets/countries.geo.json');
            const data = await response.json();
            processGeoJSON(data);
        } catch (e) {
            console.error("Failed to load country data:", e);
            // Fallback: Try to use the pre-loaded global valid if fetch failed 
            // (already checked above, but valid for debugging flow)
            alert("Map data failed to load. Please ensure assets/geo-data.js exists.");
        }
    }
}

function processGeoJSON(data) {
    state.geoJsonLayer = L.geoJSON(data, {
        style: {
            fillColor: '#00ff88',
            weight: 1,
            opacity: 0.2,       // Visible borders
            color: '#00ff88',
            fillOpacity: 0
        },
        onEachFeature: onEachFeature
    }).addTo(state.map);

    state.mapDataLoaded = true;
    console.log(`GeoJSON loaded: ${data.features.length} countries.`);
}

function onEachFeature(feature, layer) {
    layer.on({
        mouseover: highlightFeature,
        mouseout: resetHighlight,
        click: (e) => {
            // Stop event from propagating to the map (otherwise map click overrides with null)
            L.DomEvent.stopPropagation(e);
            handleMapInteraction(e, feature.properties.name);
        }
    });
}

function highlightFeature(e) {
    const layer = e.target;

    layer.setStyle({
        weight: 2,
        color: '#00ff88',
        opacity: 1,
        fillOpacity: 0.3
    });

    if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
        layer.bringToFront();
    }

    state.hoveredCountry = layer.feature.properties.name;
    // Show tool tip or status?
    // console.log("Hover: " + state.hoveredCountry);
}

function resetHighlight(e) {
    state.geoJsonLayer.resetStyle(e.target);
    state.hoveredCountry = null;
}

function handleMapInteraction(e, countryName) {
    if (screens.game.classList.contains('hidden')) return;

    const { lat, lng } = e.latlng;
    state.userGuess = { lat, lng };

    // Prioritize specific polygon click
    state.selectedCountry = countryName;

    if (state.marker) {
        state.marker.setLatLng([lat, lng]);
    } else {
        state.marker = L.marker([lat, lng]).addTo(state.map);
    }

    console.log(`Selection: ${lat.toFixed(2)}, ${lng.toFixed(2)} | Country: ${state.selectedCountry || "None"}`);
}

// Game Logic
function startGame(isDailyMode = false) {
    state.score = 0;
    state.round = 1;
    state.userGuess = null;
    state.selectedCountry = null;
    state.roundResults = [];  // Reset round results
    state.currentRoundResult = null;
    state.isDailyMode = isDailyMode;

    if (isDailyMode) {
        // Use seeded random based on today's date for daily challenge
        state.gameData = getDailyEquipment();
    } else {
        state.gameData = [...equipmentData].sort(() => 0.5 - Math.random()).slice(0, state.maxRounds);
    }

    switchScreen('game');
    loadRound();

    requestAnimationFrame(() => {
        state.map.invalidateSize();
    });
}

function loadRound() {
    resetMapVisuals();
    state.currentEquipment = state.gameData[state.round - 1];
    state.userGuess = null;
    state.selectedCountry = null;

    dom.score.textContent = state.score;
    dom.round.textContent = `${state.round}/${state.maxRounds}`;
    dom.image.src = state.currentEquipment.image;
    dom.thumbnailImage.src = state.currentEquipment.image;

    dom.specs.speed.textContent = state.currentEquipment.specs.speed;
    dom.specs.armament.textContent = state.currentEquipment.specs.armament;
    dom.specs.range.textContent = state.currentEquipment.specs.range;
    dom.specs.container.classList.add('hidden');

    // Show popup, hide thumbnail
    dom.equipmentPopup.classList.remove('minimized');
    dom.equipmentThumbnail.classList.add('hidden');

    const loader = document.querySelector('.loader');
    loader.classList.remove('hidden');
    loader.textContent = "ACCESSING ARCHIVE...";
    dom.image.classList.remove('loaded');

    dom.image.onload = () => {
        loader.classList.add('hidden');
        dom.image.classList.add('loaded');
        dom.specs.container.classList.remove('hidden');
    };

    dom.image.onerror = () => {
        console.warn("Image switching to fallback.");
        dom.image.src = `https://placehold.co/600x400/1a1a1a/00ff88?text=${encodeURIComponent(state.currentEquipment.name)}`;
        dom.image.onerror = null;
        loader.classList.add('hidden');
        dom.image.classList.add('loaded');
        dom.specs.container.classList.remove('hidden');
    };

    state.map.setView([20, 0], 2);
}

function submitGuess() {
    if (!state.userGuess) {
        alert("Select a location on the map first!");
        return;
    }

    const equipment = state.currentEquipment;
    const actual = { lat: equipment.coords[0], lng: equipment.coords[1] };

    let isCorrectCountry = false;

    if (state.selectedCountry) {
        const aliases = COUNTRY_ALIASES[equipment.origin] || [equipment.origin];
        isCorrectCountry = aliases.some(alias =>
            state.selectedCountry.toLowerCase() === alias.toLowerCase() ||
            state.selectedCountry.toLowerCase().includes(alias.toLowerCase()) ||
            alias.toLowerCase().includes(state.selectedCountry.toLowerCase())
        );
    }

    let points = 0;
    const distanceKm = calculateDistance(
        state.userGuess.lat, state.userGuess.lng,
        actual.lat, actual.lng
    );

    if (isCorrectCountry) {
        points = 5000;
        console.log("Country Verified via Leaflet Layer! Max Points.");
    } else {
        points = calculateScore(distanceKm);
        console.log(`Mismatch. Selected: ${state.selectedCountry}, Target: ${equipment.origin}`);
    }

    state.score += points;

    // Store current round result (will be completed after bonus)
    state.currentRoundResult = {
        round: state.round,
        equipment: state.currentEquipment.name,
        origin: state.currentEquipment.origin,
        type: state.currentEquipment.type,
        locationCorrect: isCorrectCountry,
        locationPoints: points,
        bonusCorrect: false,  // Will be updated after bonus
        bonusPoints: 0,
        totalPoints: points
    };

    showRoundResult(distanceKm, points, actual, state.selectedCountry || "Unknown Territory", isCorrectCountry);
}

function showRoundResult(distance, points, actual, detectedName, isCorrect) {
    if (state.actualMarker) state.map.removeLayer(state.actualMarker);

    const greenIcon = new L.Icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });

    state.actualMarker = L.marker([actual.lat, actual.lng], { icon: greenIcon })
        .addTo(state.map)
        .bindPopup(`<b>Origin: ${state.currentEquipment.origin}</b>`)
        .openPopup();

    if (!isCorrect) {
        state.line = L.polyline([
            [state.userGuess.lat, state.userGuess.lng],
            [actual.lat, actual.lng]
        ], {
            color: '#ff0055',
            weight: 3,
            opacity: 0.7,
            dashArray: '10, 10'
        }).addTo(state.map);
    }

    state.map.fitBounds([
        [state.userGuess.lat, state.userGuess.lng],
        [actual.lat, actual.lng]
    ], { padding: [50, 50] });

    dom.resultDetails.origin.textContent = state.currentEquipment.origin;

    const resultTitle = document.getElementById('result-title');

    if (isCorrect) {
        dom.resultDetails.distance.textContent = "TARGET VERIFIED (Country Match)";
        resultTitle.textContent = "TARGET NEUTRALIZED";
        resultTitle.style.color = "#00ff88";
    } else {
        dom.resultDetails.distance.textContent = `${Math.round(distance)} km off (Selected: ${detectedName})`;
        resultTitle.textContent = "TARGET MISSED";
        resultTitle.style.color = "#ffaa00";
    }

    dom.resultDetails.points.textContent = points;
    dom.score.textContent = state.score;

    // Reset bonus section for new round
    state.bonusSubmitted = false;
    dom.bonus.section.classList.remove('disabled');
    dom.bonus.result.textContent = '';
    dom.bonus.result.className = 'bonus-result';

    // Hide summary section initially
    dom.summary.section.classList.add('hidden');

    // Generate multiple choice options
    generateBonusChoices();

    setTimeout(() => {
        switchScreen('result');
    }, 1500);
}

function generateBonusChoices() {
    const correctName = state.currentEquipment.name;
    const currentType = state.currentEquipment.type;

    // Get equipment of the same type first (for better grouping)
    const sameTypeEquipment = equipmentData
        .filter(eq => eq.name !== correctName && eq.type === currentType)
        .sort(() => 0.5 - Math.random());

    // If not enough same-type equipment, add from other types
    const otherTypeEquipment = equipmentData
        .filter(eq => eq.name !== correctName && eq.type !== currentType)
        .sort(() => 0.5 - Math.random());

    // Prioritize same type, then fill with others if needed
    let wrongAnswers = [];
    if (sameTypeEquipment.length >= 3) {
        wrongAnswers = sameTypeEquipment.slice(0, 3).map(eq => eq.name);
    } else {
        wrongAnswers = [
            ...sameTypeEquipment.map(eq => eq.name),
            ...otherTypeEquipment.slice(0, 3 - sameTypeEquipment.length).map(eq => eq.name)
        ];
    }

    // Combine and shuffle all 4 options
    const allChoices = [correctName, ...wrongAnswers].sort(() => 0.5 - Math.random());

    // Clear existing choices
    dom.bonus.choices.innerHTML = '';

    // Create buttons for each choice
    allChoices.forEach(name => {
        const btn = document.createElement('button');
        btn.className = 'bonus-choice-btn';
        btn.textContent = name;
        btn.addEventListener('click', () => handleBonusChoice(btn, name, correctName));
        dom.bonus.choices.appendChild(btn);
    });
}

function handleBonusChoice(clickedBtn, selectedName, correctName) {
    if (state.bonusSubmitted) return;

    state.bonusSubmitted = true;
    dom.bonus.section.classList.add('disabled');

    const isCorrect = selectedName === correctName;

    // Highlight correct and incorrect answers
    const allBtns = dom.bonus.choices.querySelectorAll('.bonus-choice-btn');
    allBtns.forEach(btn => {
        if (btn.textContent === correctName) {
            btn.classList.add('correct');
        } else if (btn === clickedBtn && !isCorrect) {
            btn.classList.add('incorrect');
        }
    });

    if (isCorrect) {
        const bonusPoints = 2500;
        state.score += bonusPoints;
        dom.score.textContent = state.score;
        dom.bonus.result.textContent = `CORRECT! +${bonusPoints} bonus points!`;
        dom.bonus.result.className = 'bonus-result correct';

        // Update current round result with bonus
        if (state.currentRoundResult) {
            state.currentRoundResult.bonusCorrect = true;
            state.currentRoundResult.bonusPoints = bonusPoints;
            state.currentRoundResult.totalPoints += bonusPoints;
        }
    } else {
        dom.bonus.result.textContent = `INCORRECT! It was: ${correctName}`;
        dom.bonus.result.className = 'bonus-result incorrect';
    }

    // Save the round result
    if (state.currentRoundResult) {
        state.roundResults.push({ ...state.currentRoundResult });
        state.currentRoundResult = null;
    }

    // Show equipment summary after bonus is answered
    showEquipmentSummary();
}

function showEquipmentSummary() {
    const equipment = state.currentEquipment;

    // Populate summary fields
    dom.summary.year.textContent = equipment.inService;
    dom.summary.status.textContent = equipment.status;
    dom.summary.users.textContent = equipment.users.join(', ');

    // Show the summary section with a slight delay for effect
    setTimeout(() => {
        dom.summary.section.classList.remove('hidden');
    }, 300);
}

function nextRound() {
    if (state.round >= state.maxRounds) {
        endGame();
    } else {
        state.round++;
        switchScreen('game');
        loadRound();

        requestAnimationFrame(() => {
            state.map.invalidateSize();
        });
    }
}

function endGame() {
    // Populate final score
    document.getElementById('final-score').textContent = state.score;

    // Calculate performance rating
    const maxPossibleScore = state.maxRounds * 7500; // 5000 location + 2500 bonus
    const percentage = (state.score / maxPossibleScore) * 100;
    let rating = 'CERTIFIED LIZARD';

    if (percentage >= 80) rating = 'TURBO NINJA';
    else if (percentage >= 60) rating = 'THRUSTER';
    else if (percentage >= 40) rating = 'GREY MAN';
    else if (percentage >= 20) rating = 'BOTTOM THIRD';

    document.getElementById('rating-value').textContent = rating;

    // Calculate stats
    const correctLocations = state.roundResults.filter(r => r.locationCorrect).length;
    const correctIds = state.roundResults.filter(r => r.bonusCorrect).length;
    const accuracy = Math.round((correctLocations + correctIds) / (state.maxRounds * 2) * 100);

    document.getElementById('stat-correct-locations').textContent = `${correctLocations}/${state.maxRounds}`;
    document.getElementById('stat-correct-ids').textContent = `${correctIds}/${state.maxRounds}`;
    document.getElementById('stat-accuracy').textContent = `${accuracy}%`;

    // Populate rounds breakdown
    const roundsList = document.getElementById('rounds-list');
    roundsList.innerHTML = '';

    state.roundResults.forEach(result => {
        const roundItem = document.createElement('div');
        roundItem.className = 'round-item';
        roundItem.innerHTML = `
            <div class="round-number">${result.round}</div>
            <div class="round-info">
                <div class="round-equipment">${result.equipment}</div>
                <div class="round-origin">${result.origin} • ${result.type}</div>
            </div>
            <div class="round-results">
                <div class="round-location-status ${result.locationCorrect ? 'correct' : 'incorrect'}">
                    ${result.locationCorrect ? '✓' : '✗'} Location
                </div>
                <div class="round-id-status ${result.bonusCorrect ? 'correct' : 'incorrect'}">
                    ${result.bonusCorrect ? '✓' : '✗'} ID
                </div>
            </div>
            <div class="round-points">+${result.totalPoints}</div>
        `;
        roundsList.appendChild(roundItem);
    });

    // Handle daily leaderboard display
    const leaderboardSection = document.getElementById('daily-leaderboard-section');

    if (state.isDailyMode && state.playerName) {
        // Submit score first
        submitDailyScore(state.playerName, state.score);

        // Show leaderboard section
        leaderboardSection.classList.remove('hidden');

        // Check placement
        const leaderboard = getTodaysLeaderboard();
        const playerIndex = leaderboard.findIndex(entry =>
            entry.name === state.playerName && entry.score === state.score
        );

        // Generate placement message
        const placementMessage = document.getElementById('placement-message');
        if (playerIndex !== -1 && playerIndex < 5) {
            const position = playerIndex + 1;
            const suffix = position === 1 ? 'st' : position === 2 ? 'nd' : position === 3 ? 'rd' : 'th';
            placementMessage.className = 'placement-message placed';
            placementMessage.innerHTML = `
                <div class="placement-title">🎉 YOU PLACED ${position}${suffix}!</div>
                <div class="placement-detail">You made it onto today's leaderboard!</div>
            `;
        } else {
            placementMessage.className = 'placement-message not-placed';
            placementMessage.innerHTML = `
                <div class="placement-title">Not on the leaderboard</div>
                <div class="placement-detail">Try again tomorrow for another chance!</div>
            `;
        }

        // Generate leaderboard display
        const leaderboardList = document.getElementById('daily-leaderboard-list');
        if (leaderboard.length === 0) {
            leaderboardList.innerHTML = '<p class="no-scores">No scores yet</p>';
        } else {
            leaderboardList.innerHTML = leaderboard.map((entry, index) => {
                const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : 'other';
                const isCurrentPlayer = entry.name === state.playerName && entry.score === state.score;
                return `
                    <div class="leaderboard-entry ${isCurrentPlayer ? 'current-player' : ''}">
                        <div class="leaderboard-rank ${rankClass}">${index + 1}</div>
                        <div class="leaderboard-name">${escapeHtml(entry.name)}</div>
                        <div class="leaderboard-score">${entry.score}</div>
                    </div>
                `;
            }).join('');
        }
    } else {
        // Hide leaderboard section for non-daily games
        leaderboardSection.classList.add('hidden');
    }

    switchScreen('gameOver');
}

// Helpers
function switchScreen(screenName) {
    Object.values(screens).forEach(el => el.classList.add('hidden'));

    if (screenName === 'result') {
        screens.game.classList.remove('hidden');
        screens.result.classList.remove('hidden');
    } else {
        screens[screenName].classList.remove('hidden');
    }
}

function resetMapVisuals() {
    if (state.marker) state.map.removeLayer(state.marker);
    if (state.actualMarker) state.map.removeLayer(state.actualMarker);
    if (state.line) state.map.removeLayer(state.line);
    // Reset GeoJSON style
    if (state.geoJsonLayer) state.geoJsonLayer.resetStyle();

    state.marker = null;
    state.actualMarker = null;
    if (state.line) {
        state.map.removeLayer(state.line);
        state.line = null;
    }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function calculateScore(distance) {
    const maxDist = 4000;
    if (distance > maxDist) return 0;
    const score = 5000 * Math.exp(-distance / 2000);
    return Math.round(score);
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

// Equipment Popup Controls
function minimizeEquipment() {
    dom.equipmentPopup.classList.add('minimized');
    dom.equipmentThumbnail.classList.remove('hidden');
    // Set thumbnail image to match current equipment
    dom.thumbnailImage.src = dom.image.src;
}

function maximizeEquipment() {
    dom.equipmentPopup.classList.remove('minimized');
    dom.equipmentThumbnail.classList.add('hidden');
}

// ====== PRACTICE HUB FUNCTIONS ======

let practiceState = {
    currentCategory: 'all',
    selectedEquipment: null
};

const practiceDom = {
    practiceBtn: document.getElementById('practice-btn'),
    backBtn: document.getElementById('practice-back-btn'),
    equipmentGrid: document.getElementById('equipment-grid'),
    categoryBtns: document.querySelectorAll('.category-btn'),
    modal: document.getElementById('practice-detail-modal'),
    closeModalBtn: document.getElementById('close-practice-modal'),
    modalImage: document.getElementById('practice-modal-image'),
    modalName: document.getElementById('practice-modal-name'),
    modalOrigin: document.getElementById('practice-modal-origin'),
    modalType: document.getElementById('practice-modal-type'),
    modalSpeed: document.getElementById('practice-modal-speed'),
    modalArmament: document.getElementById('practice-modal-armament'),
    modalRange: document.getElementById('practice-modal-range'),
    modalService: document.getElementById('practice-modal-service'),
    modalStatus: document.getElementById('practice-modal-status'),
    modalUsers: document.getElementById('practice-modal-users')
};

function setupPracticeHub() {
    // Practice button click
    practiceDom.practiceBtn.addEventListener('click', openPracticeHub);

    // Back button click
    practiceDom.backBtn.addEventListener('click', closePracticeHub);

    // Category filter buttons
    practiceDom.categoryBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const category = btn.dataset.category;
            setActiveCategory(btn, category);
        });
    });

    // Close modal button
    practiceDom.closeModalBtn.addEventListener('click', closePracticeModal);

    // Close modal on background click
    practiceDom.modal.addEventListener('click', (e) => {
        if (e.target === practiceDom.modal) {
            closePracticeModal();
        }
    });
}

function openPracticeHub() {
    switchScreen('practice');
    practiceState.currentCategory = 'all';

    // Reset category buttons
    practiceDom.categoryBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.category === 'all') {
            btn.classList.add('active');
        }
    });

    renderEquipmentGrid('all');
}

function closePracticeHub() {
    switchScreen('start');
}

function setActiveCategory(activeBtn, category) {
    practiceState.currentCategory = category;

    // Update button states
    practiceDom.categoryBtns.forEach(btn => {
        btn.classList.remove('active');
    });
    activeBtn.classList.add('active');

    renderEquipmentGrid(category);
}

function renderEquipmentGrid(category) {
    const filteredEquipment = category === 'all'
        ? equipmentData
        : equipmentData.filter(eq => eq.type === category);

    practiceDom.equipmentGrid.innerHTML = '';

    filteredEquipment.forEach(equipment => {
        const card = createEquipmentCard(equipment);
        practiceDom.equipmentGrid.appendChild(card);
    });
}

function createEquipmentCard(equipment) {
    const card = document.createElement('div');
    card.className = 'equipment-card';
    card.innerHTML = `
        <img class="equipment-card-image" src="${equipment.image}" alt="${equipment.name}" onerror="this.src='https://placehold.co/200x140/1a1a1a/00ff88?text=${encodeURIComponent(equipment.name)}'">
        <div class="equipment-card-info">
            <div class="equipment-card-name">${equipment.name}</div>
            <div class="equipment-card-origin">${equipment.origin}</div>
            <div class="equipment-card-type">${equipment.type}</div>
        </div>
    `;

    card.addEventListener('click', () => openPracticeModal(equipment));

    return card;
}

function openPracticeModal(equipment) {
    practiceState.selectedEquipment = equipment;

    // Populate modal with equipment details
    practiceDom.modalImage.src = equipment.image;
    practiceDom.modalImage.onerror = function () {
        this.src = `https://placehold.co/800x350/1a1a1a/00ff88?text=${encodeURIComponent(equipment.name)}`;
        this.onerror = null;
    };
    practiceDom.modalName.textContent = equipment.name;
    practiceDom.modalOrigin.textContent = equipment.origin;
    practiceDom.modalType.textContent = equipment.type;
    practiceDom.modalSpeed.textContent = equipment.specs.speed;
    practiceDom.modalArmament.textContent = equipment.specs.armament;
    practiceDom.modalRange.textContent = equipment.specs.range;
    practiceDom.modalService.textContent = equipment.inService;
    practiceDom.modalStatus.textContent = equipment.status;
    practiceDom.modalUsers.textContent = equipment.users.join(', ');

    // Show modal
    practiceDom.modal.classList.remove('hidden');
}

function closePracticeModal() {
    practiceDom.modal.classList.add('hidden');
    practiceState.selectedEquipment = null;
}

// ====== DAILY CHALLENGE FUNCTIONS ======

const DAILY_STORAGE_KEY = 'defenceGuesserDaily';

function setupDailyChallenge() {
    const dailyBtn = document.getElementById('daily-btn');
    const dailyModal = document.getElementById('daily-name-modal');
    const nameInput = document.getElementById('player-name-input');
    const startBtn = document.getElementById('daily-start-btn');
    const cancelBtn = document.getElementById('daily-cancel-btn');

    // Open modal when clicking daily button
    dailyBtn.addEventListener('click', () => {
        // Check if player already played today
        if (hasPlayedToday()) {
            alert('You have already completed today\'s Daily Challenge! Come back tomorrow for a new challenge.');
            return;
        }
        dailyModal.classList.remove('hidden');
        nameInput.focus();
    });

    // Cancel button
    cancelBtn.addEventListener('click', () => {
        dailyModal.classList.add('hidden');
        nameInput.value = '';
    });

    // Start daily game
    startBtn.addEventListener('click', () => {
        const name = nameInput.value.trim();
        if (!name) {
            alert('Please enter a callsign!');
            return;
        }
        state.playerName = name;
        dailyModal.classList.add('hidden');
        nameInput.value = '';
        startGame(true); // Start in daily mode
    });

    // Enter key to start
    nameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            startBtn.click();
        }
    });
}

// Seeded random number generator for consistent daily equipment
function seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

function getTodaysSeed() {
    const today = new Date();
    return today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
}

function getDailyEquipment() {
    const seed = getTodaysSeed();
    const shuffled = [...equipmentData];

    // Fisher-Yates shuffle with seeded random
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom(seed + i) * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, state.maxRounds);
}

function hasPlayedToday() {
    const data = getDailyData();
    const todayKey = getTodaysSeed().toString();
    return data.played && data.played[todayKey] === true;
}

function markAsPlayedToday() {
    const data = getDailyData();
    const todayKey = getTodaysSeed().toString();
    if (!data.played) data.played = {};
    data.played[todayKey] = true;
    saveDailyData(data);
}

function getDailyData() {
    try {
        const stored = localStorage.getItem(DAILY_STORAGE_KEY);
        return stored ? JSON.parse(stored) : { leaderboards: {}, played: {} };
    } catch (e) {
        return { leaderboards: {}, played: {} };
    }
}

function saveDailyData(data) {
    try {
        localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('Failed to save daily data:', e);
    }
}

function getTodaysLeaderboard() {
    const data = getDailyData();
    const todayKey = getTodaysSeed().toString();
    return data.leaderboards[todayKey] || [];
}

function submitDailyScore(name, score) {
    const data = getDailyData();
    const todayKey = getTodaysSeed().toString();

    if (!data.leaderboards[todayKey]) {
        data.leaderboards[todayKey] = [];
    }

    // Add new score with timestamp
    data.leaderboards[todayKey].push({
        name: name,
        score: score,
        timestamp: Date.now()
    });

    // Sort by score (descending), then by timestamp (ascending) for ties
    data.leaderboards[todayKey].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.timestamp - b.timestamp; // Earlier timestamp wins
    });

    // Keep only top 5
    data.leaderboards[todayKey] = data.leaderboards[todayKey].slice(0, 5);

    // Mark as played today
    if (!data.played) data.played = {};
    data.played[todayKey] = true;

    saveDailyData(data);
    refreshLeaderboardPreview();
}

function refreshLeaderboardPreview() {
    const leaderboard = getTodaysLeaderboard();
    const container = document.getElementById('leaderboard-mini');

    if (leaderboard.length === 0) {
        container.innerHTML = '<p class="no-scores">No scores yet today. Be the first!</p>';
        return;
    }

    container.innerHTML = leaderboard.map((entry, index) => {
        const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : 'other';
        return `
            <div class="leaderboard-entry">
                <div class="leaderboard-rank ${rankClass}">${index + 1}</div>
                <div class="leaderboard-name">${escapeHtml(entry.name)}</div>
                <div class="leaderboard-score">${entry.score}</div>
            </div>
        `;
    }).join('');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Clean up old leaderboard data (keep only last 7 days)
function cleanupOldLeaderboards() {
    const data = getDailyData();
    const today = getTodaysSeed();
    const cutoff = today - 7; // Keep last 7 days

    let changed = false;
    for (const key of Object.keys(data.leaderboards)) {
        if (parseInt(key) < cutoff) {
            delete data.leaderboards[key];
            changed = true;
        }
    }
    for (const key of Object.keys(data.played || {})) {
        if (parseInt(key) < cutoff) {
            delete data.played[key];
            changed = true;
        }
    }

    if (changed) {
        saveDailyData(data);
    }
}

// Run cleanup on init
cleanupOldLeaderboards();

init();
