const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

/* --- STATE --- */
let gameState = 'MENU';
let score = 0;
let level = 1;
let cityHealth = 100;
let ammo = 100;
let frame = 0;
let difficulty = 1;

// Leveling Variables
let killsThisLevel = 0;
let killsNeeded = 10;

// Entities
let missiles = [];
let explosions = [];
let enemies = [];
let particles = [];
let ash = []; 

// Input
const mouse = { x: canvas.width/2, y: canvas.height/2 };
window.addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});

// CONTROL: FIRE WITH CTRL
window.addEventListener('keydown', e => {
    if (e.key === 'Control') {
        shoot();
    }
});

/* --- LOUD AUDIO ENGINE --- */
const AudioSys = {
    ctx: null,
    masterGain: null,
    droneNodes: [],
    noiseBuffer: null,

    init: () => {
        if(!AudioSys.ctx) {
            AudioSys.ctx = new (window.AudioContext || window.webkitAudioContext)();
            AudioSys.masterGain = AudioSys.ctx.createGain();
            
            // --- VOLUME BOOSTED TO 400% ---
            AudioSys.masterGain.gain.value = 4.0; 
            
            AudioSys.masterGain.connect(AudioSys.ctx.destination);
            
            // Noise Buffer for Explosions
            const bufferSize = AudioSys.ctx.sampleRate * 2;
            const buffer = AudioSys.ctx.createBuffer(1, bufferSize, AudioSys.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            AudioSys.noiseBuffer = buffer;
        }
    },

    // 1. THE ABYSS (Drone)
    startDrone: () => {
        if (!AudioSys.ctx) return;
        AudioSys.stopDrone();

        const t = AudioSys.ctx.currentTime;
        // Louder Drone Frequencies
        const freqs = [55, 58, 110]; 
        
        freqs.forEach(f => {
            const osc = AudioSys.ctx.createOscillator();
            const gain = AudioSys.ctx.createGain();
            
            osc.type = 'sawtooth';
            osc.frequency.value = f;
            
            const filter = AudioSys.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 180;
            
            const lfo = AudioSys.ctx.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.value = 0.1;
            const lfoGain = AudioSys.ctx.createGain();
            lfoGain.gain.value = 50;
            
            lfo.connect(lfoGain);
            lfoGain.connect(filter.frequency);

            // Boosted Drone Volume
            gain.gain.setValueAtTime(0.2, t); 
            
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(AudioSys.masterGain);
            
            osc.start();
            lfo.start();
            
            AudioSys.droneNodes.push({ osc, lfo, gain });
        });
    },

    stopDrone: () => {
        AudioSys.droneNodes.forEach(node => {
            try {
                node.gain.gain.exponentialRampToValueAtTime(0.001, AudioSys.ctx.currentTime + 2);
                node.osc.stop(AudioSys.ctx.currentTime + 2);
                node.lfo.stop(AudioSys.ctx.currentTime + 2);
            } catch(e){}
        });
        AudioSys.droneNodes = [];
    },

    // 2. THE WEAPON (Heavy Railgun)
    shoot: () => {
        if(!AudioSys.ctx) return;
        const t = AudioSys.ctx.currentTime;
        
        // Layer 1: The Kick
        const osc = AudioSys.ctx.createOscillator();
        const oscGain = AudioSys.ctx.createGain();
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(10, t + 0.15); 
        
        // Boosted Shoot Volume
        oscGain.gain.setValueAtTime(0.8, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        
        osc.connect(oscGain);
        oscGain.connect(AudioSys.masterGain);
        osc.start();
        osc.stop(t + 0.2);

        // Layer 2: The Blast
        const noise = AudioSys.ctx.createBufferSource();
        noise.buffer = AudioSys.noiseBuffer;
        const noiseFilter = AudioSys.ctx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.setValueAtTime(1000, t); 
        noiseFilter.frequency.exponentialRampToValueAtTime(100, t + 0.1);
        const noiseGain = AudioSys.ctx.createGain();
        
        noiseGain.gain.setValueAtTime(0.6, t); // Boosted Noise
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(AudioSys.masterGain);
        noise.start();
        noise.stop(t + 0.2);
    },

    // 3. THE SCREAM (Spawn Sound)
    playSpawnScreech: () => {
        if(!AudioSys.ctx) return;
        const t = AudioSys.ctx.currentTime;
        
        const carrier = AudioSys.ctx.createOscillator();
        const modulator = AudioSys.ctx.createOscillator();
        const gain = AudioSys.ctx.createGain();
        const modGain = AudioSys.ctx.createGain();

        carrier.type = 'sawtooth';
        carrier.frequency.setValueAtTime(100, t);
        carrier.frequency.linearRampToValueAtTime(400, t + 0.6); 

        modulator.type = 'square';
        modulator.frequency.value = 73; 
        modGain.gain.value = 300; 

        modulator.connect(modGain);
        modGain.connect(carrier.frequency);

        const filter = AudioSys.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1500;

        gain.gain.setValueAtTime(0.3, t); // Boosted Scream
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

        carrier.connect(filter);
        filter.connect(gain);
        gain.connect(AudioSys.masterGain);
        
        carrier.start();
        modulator.start();
        carrier.stop(t + 0.6);
        modulator.stop(t + 0.6);
    },

    // 4. THE DESTRUCTION (Explosion)
    explode: (isMassive = false) => {
        if(!AudioSys.ctx) return;
        const t = AudioSys.ctx.currentTime;
        const duration = isMassive ? 2.5 : 0.8;

        const src = AudioSys.ctx.createBufferSource();
        src.buffer = AudioSys.noiseBuffer;
        
        const filter = AudioSys.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(isMassive ? 300 : 500, t); 
        filter.frequency.exponentialRampToValueAtTime(20, t + duration);
        
        const gain = AudioSys.ctx.createGain();
        // Massive Volume Boost for Explosions
        gain.gain.setValueAtTime(isMassive ? 2.0 : 0.8, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

        src.connect(filter);
        filter.connect(gain);
        gain.connect(AudioSys.masterGain);
        
        src.start();
        src.stop(t + duration);
    },

    playLevelUp: () => {
        if(!AudioSys.ctx) return;
        const t = AudioSys.ctx.currentTime;
        [110, 130, 196].forEach((f, i) => {
             const osc = AudioSys.ctx.createOscillator();
             const g = AudioSys.ctx.createGain();
             osc.type = 'triangle';
             osc.frequency.value = f;
             g.gain.setValueAtTime(0, t);
             g.gain.linearRampToValueAtTime(0.4, t + 1); // Boosted Level Up
             g.gain.linearRampToValueAtTime(0, t + 2);
             osc.connect(g);
             g.connect(AudioSys.masterGain);
             osc.start();
             osc.stop(t+2);
        });
    }
};

/* --- CLASSES --- */

class Missile {
    constructor(tx, ty) {
        this.x = canvas.width / 2;
        this.y = canvas.height - 20;
        this.tx = tx;
        this.ty = ty;
        
        const angle = Math.atan2(ty - this.y, tx - this.x);
        this.speed = 30; // High velocity
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
        this.active = true;
        this.distTotal = Math.hypot(tx - this.x, ty - this.y);
        this.distTraveled = 0;
    }
    
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.distTraveled += this.speed;
        
        // Red glowing trail
        particles.push(new Particle(this.x, this.y, '#ff4444', 0.5)); 

        if (this.distTraveled >= this.distTotal) {
            this.active = false;
            createExplosion(this.x, this.y);
        }
    }
    
    draw() {
        ctx.strokeStyle = '#ffaaaa';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x - this.vx, this.y - this.vy);
        ctx.stroke();
    }
}

class Explosion {
    constructor(x, y, isMassive = false) {
        this.x = x;
        this.y = y;
        this.radius = 1;
        this.maxRadius = isMassive ? 250 : 90; 
        this.growthRate = isMassive ? 10 : 7; 
        this.active = true;
        AudioSys.explode(isMassive);
    }
    
    update() {
        if (this.radius < this.maxRadius) {
            this.radius += this.growthRate;
        } else {
            this.active = false;
        }
    }
    
    draw() {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255, 60, 0, ${1 - (this.radius / this.maxRadius)})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
    }
}

class Hunter {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = -80;
        this.targetX = Math.random() * canvas.width;
        this.targetY = canvas.height;
        
        this.scale = 3.5; 
        
        const angle = Math.atan2(this.targetY - this.y, this.targetX - this.x);
        this.baseVx = Math.cos(angle);
        this.baseVy = Math.sin(angle);
        
        // Speed Calculation
        this.speed = (Math.random() * 2 + 5) + (level * 2.0);
        
        this.wobblePhase = Math.random() * Math.PI * 2;
        this.wobbleSpeed = 0.15;
        this.wobbleAmount = 3;
        
        this.active = true;
        AudioSys.playSpawnScreech();
    }
    
    update() {
        this.wobblePhase += this.wobbleSpeed;
        const wobbleX = Math.cos(this.wobblePhase) * this.wobbleAmount;
        
        this.x += (this.baseVx * this.speed) + wobbleX;
        this.y += (this.baseVy * this.speed);
        
        if(frame % 3 === 0) particles.push(new Particle(this.x, this.y, '#330000', 1.5)); 

        if (this.y > canvas.height - 10) {
            this.active = false;
            cityHit(this.x);
        }
    }
    
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(this.scale, this.scale);
        
        const angle = Math.atan2(this.baseVy, this.baseVx);
        ctx.rotate(angle + Math.PI/2); 
        
        ctx.fillStyle = '#050000';
        ctx.strokeStyle = '#880000'; 
        ctx.lineWidth = 1.5;
        
        ctx.beginPath();
        ctx.moveTo(0, 10);
        ctx.lineTo(8, -8);
        ctx.lineTo(0, -4);
        ctx.lineTo(-8, -8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = `rgba(200, 0, 0, ${Math.abs(Math.sin(frame * 0.2))})`;
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
    }
}

class Particle {
    constructor(x, y, color, life) {
        this.x = x; this.y = y;
        this.vx = (Math.random() - 0.5) * 5;
        this.vy = (Math.random() - 0.5) * 5;
        this.life = life;
        this.color = color;
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        this.life -= 0.03;
    }
    draw() {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, 4, 4);
        ctx.globalAlpha = 1;
    }
}

/* --- LOGIC --- */

function init() {
    score = 0;
    cityHealth = 100;
    difficulty = 1.0; 
    level = 1;
    killsThisLevel = 0;
    killsNeeded = 10;
    
    missiles = [];
    explosions = [];
    enemies = [];
    particles = [];
    
    // Ash
    ash = [];
    for(let i=0; i<80; i++) {
        ash.push({
            x: Math.random()*canvas.width, 
            y: Math.random()*canvas.height, 
            s: Math.random()*3, 
            speed: Math.random() * 0.5 + 0.1
        });
    }
    
    AudioSys.startDrone();
    updateUI();
}

function shoot() {
    if (gameState !== 'PLAYING') return;
    if (ammo >= 5) {
        missiles.push(new Missile(mouse.x, mouse.y));
        ammo -= 5;
        AudioSys.shoot();
        updateUI();
    }
}

function createExplosion(x, y, isMassive = false) {
    explosions.push(new Explosion(x, y, isMassive));
}

function cityHit(x) {
    cityHealth -= 20; 
    createExplosion(x, canvas.height, true); 
    updateUI();
    
    // Violent Shake
    ctx.translate((Math.random()-0.5)*90, (Math.random()-0.5)*90);
    setTimeout(() => ctx.setTransform(1,0,0,1,0,0), 100);

    if (cityHealth <= 0) {
        cityHealth = 0;
        gameOver();
    }
}

function checkCollisions() {
    for (let e = enemies.length - 1; e >= 0; e--) {
        let enemy = enemies[e];
        for (let ex of explosions) {
            const dist = Math.hypot(enemy.x - ex.x, enemy.y - ex.y);
            if (dist < ex.radius + 30) { 
                enemy.active = false;
                score += 50;
                killsThisLevel++;
                
                for(let i=0; i<12; i++) particles.push(new Particle(enemy.x, enemy.y, '#888', 1));
                
                checkLevelUp();
                break;
            }
        }
    }
}

function checkLevelUp() {
    if (killsThisLevel >= killsNeeded) {
        level++;
        killsThisLevel = 0;
        killsNeeded += 5; 
        difficulty += 0.5;
        AudioSys.playLevelUp();
        
        if(cityHealth < 100) cityHealth += 20;
        
        const msg = document.createElement('div');
        msg.innerText = "NIGHTMARE LEVEL " + level;
        msg.style.position = 'absolute';
        msg.style.top = '40%'; msg.style.left = '50%';
        msg.style.transform = 'translate(-50%, -50%)';
        msg.style.color = '#aa0000'; 
        msg.style.fontSize = '8rem';
        msg.style.fontFamily = 'Share Tech Mono';
        msg.style.textShadow = '0 0 30px #ff0000';
        msg.style.zIndex = '100';
        msg.style.pointerEvents = 'none';
        document.body.appendChild(msg);
        setTimeout(() => msg.remove(), 2000);
    }
    updateUI();
}

function updateUI() {
    document.getElementById('score').innerText = `LVL ${level} | ${score}`;
    document.getElementById('health').innerText = cityHealth + "%";
    document.getElementById('ammo-fill').style.width = ammo + "%";
    document.getElementById('ammo-fill').style.backgroundColor = '#ff4444';
    
    const hEl = document.getElementById('health-box');
    if (hEl) { // Check if element exists before setting style
        if(cityHealth > 60) hEl.style.color = '#ff4444';
        else if (cityHealth > 20) hEl.style.color = 'orange';
        else hEl.style.color = 'darkred';
    }
}

function gameOver() {
    gameState = 'GAMEOVER';
    AudioSys.stopDrone();
    AudioSys.explode(true);
    document.getElementById('game-over-screen').classList.remove('hidden');
    document.getElementById('final-score').innerText = score;
}

function loop() {
    if (gameState !== 'PLAYING') {
        requestAnimationFrame(loop);
        return;
    }

    // --- HELLSCAPE RENDER ---
    ctx.fillStyle = 'rgba(20, 0, 0, 0.4)'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#444'; 
    ash.forEach(s => {
        s.y -= s.speed;
        if(s.y < 0) s.y = canvas.height;
        ctx.globalAlpha = Math.random() * 0.5;
        ctx.fillRect(s.x, s.y, s.s, s.s);
    });
    ctx.globalAlpha = 1;

    // Floor Glow
    const bgGrad = ctx.createLinearGradient(0, canvas.height - 100, 0, canvas.height);
    bgGrad.addColorStop(0, 'rgba(0,0,0,0)');
    bgGrad.addColorStop(1, `rgba(100, 0, 0, ${0.2 + Math.sin(frame * 0.05) * 0.1})`);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, canvas.height - 100, canvas.width, 100);

    // Ammo Recharge
    if (frame % 4 === 0 && ammo < 100) {
        ammo += 2; 
        updateUI();
    }
    
    // Spawn Rate Logic
    let spawnRate = Math.max(8, 80 - (level * 10));
    
    if (frame % spawnRate === 0) {
        enemies.push(new Hunter());
    }

    missiles.forEach(m => m.update());
    explosions.forEach(e => e.update());
    enemies.forEach(e => e.update());
    particles.forEach(p => p.update());

    checkCollisions();

    missiles = missiles.filter(m => m.active);
    explosions = explosions.filter(e => e.active);
    enemies = enemies.filter(e => e.active);
    particles = particles.filter(p => p.life > 0);

    missiles.forEach(m => m.draw());
    explosions.forEach(e => e.draw());
    enemies.forEach(e => e.draw());
    particles.forEach(p => p.draw());

    // Aim Line
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.moveTo(canvas.width/2, canvas.height - 20);
    ctx.lineTo(mouse.x, mouse.y);
    ctx.stroke();

    // Crosshair
    ctx.strokeStyle = '#ff0000';
    ctx.strokeRect(mouse.x - 10, mouse.y - 10, 20, 20);
    
    frame++;
    requestAnimationFrame(loop);
}

document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('start-screen').classList.add('hidden');
    AudioSys.init();
    gameState = 'PLAYING';
    init();
    loop();
});

document.getElementById('restart-btn').addEventListener('click', () => {
    document.getElementById('game-over-screen').classList.add('hidden');
    init();
    gameState = 'PLAYING';
});