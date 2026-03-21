/**
 * Blood Drip - Foundry VTT Module
 * Animated blood effect on tokens below a configurable HP threshold.
 * Targets: Foundry VTT v11–v13, Pathfinder 2e (and any system using system.attributes.hp)
 */

const MODULE_ID = 'blood-drip';

// ── Colour palettes ────────────────────────────────────────────────────────────
const BLOOD_COLORS = {
  dark:   { primary: 0x8B0000, secondary: 0x6B0000 },
  bright: { primary: 0xCC0000, secondary: 0xFF2222 },
  black:  { primary: 0x1A0000, secondary: 0x0D0000 },
  green:  { primary: 0x005500, secondary: 0x003300 },
  blue:   { primary: 0x000099, secondary: 0x000066 },
};

// Tracks active effects: tokenId → { container, mesh, tick }
const activeEffects = new Map();

// [EXPERIMENTAL] Tracks death blood pools: tokenId → { container, fadeTimeout }
const activeDeathPools = new Map();

// ── Settings ───────────────────────────────────────────────────────────────────

Hooks.once('init', () => {
  console.log(`${MODULE_ID} | Blood Drip module initialized`);

  // ── Quality preset — registered first so it appears at the top ────────────
  game.settings.register(MODULE_ID, 'qualityPreset', {
    name: 'Quality Preset',
    hint: 'Quickly tune all performance-sensitive settings at once. Change this first, then customise individual settings as desired.',
    scope: 'world',
    config: true,
    type: String,
    choices: {
      low:    '🐢 Low  — optimized for slower / player computers',
      medium: '⚖️  Medium — balanced quality and performance',
      high:   '✨ High — best quality (recommended for GM only)',
    },
    default: 'low',
    onChange: applyQualityPreset,
  });

  game.settings.register(MODULE_ID, 'hpThreshold', {
    name: 'HP Threshold (%)',
    hint: 'Blood effect activates when current HP falls below this percentage of max HP.',
    scope: 'world',
    config: true,
    type: Number,
    range: { min: 5, max: 75, step: 5 },
    default: 25,
    onChange: refreshAllEffects,
  });

  game.settings.register(MODULE_ID, 'bloodColor', {
    name: 'Blood Color',
    scope: 'world',
    config: true,
    type: String,
    choices: {
      dark:   'Dark Red (default)',
      bright: 'Bright Red',
      black:  'Black (Undead / Necrotic)',
      green:  'Green (Poison / Acid)',
      blue:   'Blue (Magical)',
    },
    default: 'dark',
    onChange: refreshAllEffects,
  });

  game.settings.register(MODULE_ID, 'bloodStyle', {
    name: 'Blood Style',
    hint: 'Visual style of the blood effect.',
    scope: 'world',
    config: true,
    type: String,
    choices: {
      drops:        '🟢 Dripping Drops — teardrop beads along the full token border',
      dropsOnly:    '🟢 Dripping Drops (no border) — same drops, no circular ring',
      bottomHalf:   '🟢 Bottom Half — drops only from the lower semicircle, no ring',
      liquidBorder: '🟡 Liquid Border — animated wavy blood ring (redraws each frame)',
      sequencer:    '🔵 JB2A / Sequencer — plays a persistent animation from your JB2A library',
    },
    default: 'dropsOnly',
    onChange: refreshAllEffects,
  });

  game.settings.register(MODULE_ID, 'jb2aFile', {
    name: 'JB2A Animation Path',
    hint: 'File or Sequencer database path used when Blood Style is set to JB2A / Sequencer. '
        + 'Open the Sequencer Database Viewer in-game (Sequencer icon in the toolbar) to browse '
        + 'and copy a path, e.g. "jb2a.liquid.blood.red.1".',
    scope: 'world',
    config: true,
    type: String,
    default: 'jb2a.liquid.blood.red.1',
    onChange: refreshAllEffects,
  });

  game.settings.register(MODULE_ID, 'jb2aScale', {
    name: 'JB2A Animation Scale',
    hint: 'Size of the JB2A animation relative to the token. Increase if the animation appears too small.',
    scope: 'world',
    config: true,
    type: Number,
    range: { min: 0.5, max: 4.0, step: 0.1 },
    default: 2.0,
    onChange: refreshAllEffects,
  });

  game.settings.register(MODULE_ID, 'jb2aOpacity', {
    name: 'JB2A Animation Opacity',
    hint: 'Transparency of the JB2A animation. 1.0 = fully opaque, 0.1 = nearly invisible.',
    scope: 'world',
    config: true,
    type: Number,
    range: { min: 0.1, max: 1.0, step: 0.05 },
    default: 0.85,
    onChange: refreshAllEffects,
  });

  game.settings.register(MODULE_ID, 'gmOnly', {
    name: 'GM Only (JB2A)',
    hint: 'When using JB2A style, only the GM sees the blood effect. Players see nothing.',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
    onChange: refreshAllEffects,
  });

  game.settings.register(MODULE_ID, 'dropCount', {
    name: 'Drop Count (PIXI styles)',
    hint: '🟡 Performance cost: each drop is a live PIXI object updated every frame. Keep this low on slower computers.',
    scope: 'world',
    config: true,
    type: Number,
    range: { min: 4, max: 40, step: 2 },
    default: 12,
    onChange: refreshAllEffects,
  });

  game.settings.register(MODULE_ID, 'dropSpeed', {
    name: 'Drop Speed (PIXI styles)',
    hint: 'Speed multiplier for falling drops. 1.0 is default, 2.0 is twice as fast.',
    scope: 'world',
    config: true,
    type: Number,
    range: { min: 0.25, max: 4.0, step: 0.25 },
    default: 1.0,
    onChange: refreshAllEffects,
  });

  game.settings.register(MODULE_ID, 'chatAlert', {
    name: 'Chat Alert on Threshold',
    hint: 'Post a message in chat when a token crosses the HP threshold.',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, 'chatAlertFilter', {
    name: 'Chat Alert — Apply To',
    hint: 'Which tokens trigger the chat alert message when crossing the HP threshold.',
    scope: 'world',
    config: true,
    type: String,
    choices: {
      all: 'All tokens',
      pc:  'Player characters only',
      npc: 'NPCs only',
    },
    default: 'pc',
  });

  game.settings.register(MODULE_ID, 'chatText', {
    name: 'Chat Alert Message',
    hint: 'Text posted when a token crosses the threshold. Use {name} for the token\'s name.',
    scope: 'world',
    config: true,
    type: String,
    default: '⚠ {name} is critically wounded and bleeding!',
  });

  game.settings.register(MODULE_ID, 'soundPath', {
    name: 'Threshold Sound Effect',
    hint: 'Sound played when a token crosses the HP threshold. Use a Foundry file path or leave blank to disable.',
    scope: 'world',
    config: true,
    type: String,
    default: 'sounds/notify.wav',
  });

  game.settings.register(MODULE_ID, 'soundVolume', {
    name: 'Sound Effect Volume',
    scope: 'world',
    config: true,
    type: Number,
    range: { min: 0.0, max: 1.0, step: 0.05 },
    default: 0.8,
  });

  game.settings.register(MODULE_ID, 'tokenFilter', {
    name: 'Apply Effect To',
    hint: 'Which tokens should show the blood effect when below the HP threshold.',
    scope: 'world',
    config: true,
    type: String,
    choices: {
      all:       'All tokens',
      pc:        'Player characters only',
      npc:       'NPCs only',
    },
    default: 'all',
    onChange: refreshAllEffects,
  });

  game.settings.register(MODULE_ID, 'continuousFlow', {
    name: 'Continuous Blood Flow',
    hint: '🟢 Low performance cost. Blood streams flow perpetually instead of individual drops that fade in and out. Higher drop counts look best with this enabled.',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
    onChange: refreshAllEffects,
  });

  game.settings.register(MODULE_ID, 'liquidFilters', {
    name: 'Liquid Filters',
    hint: '🔴 High performance cost — GPU blur + displacement applied every frame. Disable on slower computers.',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
    onChange: refreshAllEffects,
  });

  game.settings.register(MODULE_ID, 'containBlood', {
    name: 'Contain Blood to Token',
    hint: 'Clips the PIXI blood effect to the token\'s circular boundary so drops do not bleed into adjacent grid spaces.',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
    onChange: refreshAllEffects,
  });

  // ── [EXPERIMENTAL] Death Blood Pool ─────────────────────────────────────────
  game.settings.register(MODULE_ID, 'deathEffect', {
    name: '[EXPERIMENTAL] Death Blood Pool',
    hint: 'When a token drops to 0 HP, a blood burst and spreading pool appear at their location. The pool fades after 30 seconds. Wall-aware — blood will not pass through walls.',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register(MODULE_ID, 'deathPoolMax', {
    name: '[EXPERIMENTAL] Max Concurrent Death Pools',
    hint: 'Maximum number of death pools allowed at once. Set to 0 to disable the pool entirely (the burst will still play if the Death Blood Pool setting is on).',
    scope: 'world',
    config: true,
    type: Number,
    range: { min: 0, max: 10, step: 1 },
    default: 3,
  });
});

// ── Quality preset application ─────────────────────────────────────────────────

const QUALITY_PRESETS = {
  low: {
    dropCount:      6,
    dropSpeed:      1.0,
    liquidFilters:  false,
    continuousFlow: false,
  },
  medium: {
    dropCount:      12,
    dropSpeed:      1.0,
    liquidFilters:  false,
    continuousFlow: false,
  },
  high: {
    dropCount:      22,
    dropSpeed:      1.0,
    liquidFilters:  true,
    continuousFlow: true,
  },
};

function applyQualityPreset(preset) {
  const values = QUALITY_PRESETS[preset];
  if (!values) return;
  // Set each value; their individual onChange handlers will fire but
  // refreshAllEffects will ultimately settle once all changes are applied.
  for (const [key, val] of Object.entries(values)) {
    game.settings.set(MODULE_ID, key, val);
  }
}

// ── Settings UI — file picker buttons ─────────────────────────────────────────

Hooks.on('renderSettingsConfig', (_app, html) => {
  // html is a jQuery object in v11, a plain HTMLElement in v12+ (ApplicationV2).
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root) return;

  addFilePicker(root, `${MODULE_ID}.soundPath`, 'audio',
    'Browse audio files (wav, ogg, mp3)');
  addFilePicker(root, `${MODULE_ID}.jb2aFile`, 'video',
    'Browse video files (webm) — or type a Sequencer database path manually');
});

/**
 * Injects a FilePicker button next to a text setting input.
 * Tries two selectors for v13 compatibility and logs a warning if neither works.
 */
function addFilePicker(root, inputName, type, title) {
  // Primary: standard Foundry name attribute.
  // Fallback: data-setting-id on the form-group (v13 ApplicationV2 structure).
  let input = root.querySelector(`input[name="${inputName}"]`);
  if (!input) {
    const group = root.querySelector(`[data-setting-id="${inputName}"]`);
    input = group?.querySelector('input[type="text"]');
  }
  if (!input || !input.parentNode) {
    console.debug(`${MODULE_ID} | addFilePicker: input not found for "${inputName}" — button not injected`);
    return;
  }

  // Guard against double-injection if the hook fires more than once.
  if (input.parentNode.classList?.contains('blood-drip-file-row')) return;

  const btn = document.createElement('button');
  btn.type      = 'button';
  btn.className = 'file-picker';
  btn.title     = title;
  btn.innerHTML = '<i class="fas fa-file-import"></i>';

  btn.addEventListener('click', (ev) => {
    ev.preventDefault();
    new FilePicker({
      type,
      current:  input.value,
      callback: (path) => { input.value = path; },
    }).browse();
  });

  const wrapper = document.createElement('div');
  wrapper.className     = 'blood-drip-file-row';
  wrapper.style.cssText = 'display:flex;align-items:center;flex:1;gap:4px;';
  input.style.flex      = '1';
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);
  wrapper.appendChild(btn);
}

// ── Lifecycle Hooks ────────────────────────────────────────────────────────────

/**
 * On every canvas load (including reloads), wipe any blood-drip Sequencer
 * effects left over from a previous session. They are persistent in Foundry's
 * database so they survive reloads, but our in-memory activeEffects Map does
 * not — without this cleanup we'd stack duplicate effects on every reload.
 * After clearing, refreshAllEffects() re-applies effects to tokens that still
 * qualify, giving each token exactly one fresh effect.
 */
Hooks.on('canvasReady', () => {
  if (game.modules.get('sequencer')?.active) {
    // End by origin tag (set on every effect we create) — clears all persistent
    // blood-drip effects from the previous session before we re-apply fresh ones.
    Sequencer.EffectManager.endEffects({ origin: MODULE_ID });
  }
  // Clear any death pools from the previous scene — they are PIXI-only and
  // do not survive a canvas reload, so we wipe the tracking map and let
  // timeouts/ticks expire naturally.
  clearAllDeathPools();
  // Small delay so token meshes are fully initialized before we try to attach
  // PIXI containers or Sequencer effects to them.
  setTimeout(refreshAllEffects, 500);
});

Hooks.on('updateActor', (actor, changes) => {
  const newHp = foundry.utils.getProperty(changes, 'system.attributes.hp.value');
  if (newHp === undefined) return;

  const maxHp = actor.system?.attributes?.hp?.max;
  if (!maxHp) return;

  if (!actorPassesFilter(actor)) return;

  const crossingThreshold = newHp / maxHp <= getThreshold() && newHp > 0;
  const tokens = canvas.tokens?.placeables?.filter(t => t.actor?.id === actor.id) ?? [];

  for (const token of tokens) {
    const wasActive = activeEffects.has(token.id);

    // [EXPERIMENTAL] Trigger death pool when HP hits exactly 0.
    if (newHp === 0) triggerDeathEffect(token);

    if (crossingThreshold) {
      startBloodDrip(token);
      // Only fire notifications the first time this token crosses the threshold.
      if (!wasActive) {
        const alertFilter = game.settings.get(MODULE_ID, 'chatAlertFilter') ?? 'pc';
        const passesAlert = alertFilter === 'all'
          || (alertFilter === 'pc'  && actor.type === 'character')
          || (alertFilter === 'npc' && actor.type === 'npc');

        if (passesAlert) {
          if (game.settings.get(MODULE_ID, 'chatAlert')) {
            const template = game.settings.get(MODULE_ID, 'chatText') || '⚠ {name} is critically wounded and bleeding!';
            const content  = template.replace(/\{name\}/g, actor.name);
            ChatMessage.create({
              content: `<div style="color:darkred;font-weight:bold;">${content}</div>`,
              speaker: { alias: 'Blood Drip' },
            });
          }
          const soundSrc = game.settings.get(MODULE_ID, 'soundPath')?.trim();
          if (soundSrc) {
            AudioHelper.play({
              src:      soundSrc,
              volume:   game.settings.get(MODULE_ID, 'soundVolume') ?? 0.8,
              autoplay: true,
              loop:     false,
            }, /* broadcast= */ true);
          }
        }
      }
    } else {
      stopBloodDrip(token.id);
    }
  }
});

Hooks.on('drawToken', (token) => {
  // Sequencer effects are attached to the token document, not the PIXI mesh —
  // they survive redraws on their own. Only restart PIXI-based effects.
  const existing = activeEffects.get(token.id);
  if (existing?.type === 'sequencer') return;

  stopBloodDrip(token.id);

  const actor = token.actor;
  if (!actor || !actorPassesFilter(actor)) return;

  const hp = actor.system?.attributes?.hp;
  if (!hp?.max) return;

  if (hp.value / hp.max <= getThreshold() && hp.value > 0) {
    startBloodDrip(token);
  }
});

Hooks.on('refreshToken', (token) => {
  // Safety net: after drag-and-drop, restart the effect if it was lost.
  if (activeEffects.has(token.id)) return;

  const actor = token.actor;
  if (!actor || !actorPassesFilter(actor)) return;

  const hp = actor.system?.attributes?.hp;
  if (!hp?.max) return;

  if (hp.value / hp.max <= getThreshold() && hp.value > 0) {
    startBloodDrip(token);
  }
});

Hooks.on('deleteToken', (tokenDoc) => {
  stopBloodDrip(tokenDoc.id);
  // Free the death pool slot — the pool itself stays on canvas and fades naturally.
  activeDeathPools.delete(tokenDoc.id);
});

// ── Core ───────────────────────────────────────────────────────────────────────

function getThreshold() {
  return (game.settings.get(MODULE_ID, 'hpThreshold') ?? 25) / 100;
}

/** Returns true if the actor passes the current token filter setting. */
function actorPassesFilter(actor) {
  const filter = game.settings.get(MODULE_ID, 'tokenFilter') ?? 'all';
  if (filter === 'all') return true;
  // PF2e: player characters have type 'character', NPCs have type 'npc'
  if (filter === 'pc')  return actor.type === 'character';
  if (filter === 'npc') return actor.type === 'npc';
  return true;
}

function getColors() {
  const key = game.settings.get(MODULE_ID, 'bloodColor') ?? 'dark';
  return BLOOD_COLORS[key] ?? BLOOD_COLORS.dark;
}

function getStyle() {
  return game.settings.get(MODULE_ID, 'bloodStyle') ?? 'drops';
}

function startBloodDrip(token) {
  if (activeEffects.has(token.id)) return;

  const style = getStyle();

  if (style === 'sequencer') {
    startSequencerEffect(token);
    return;
  }

  const mesh = token.mesh;
  if (!mesh) return;

  const texSize  = mesh.texture?.width ?? token.w;
  const radius   = texSize * 0.48;
  const colors   = getColors();

  const container    = new PIXI.Container();
  container.name     = 'bloodDripContainer';

  let tick;
  if      (style === 'liquidBorder') tick = buildLiquidBorderTick(container, radius, texSize, colors, token.id);
  else if (style === 'dropsOnly')    tick = buildDropsTick(container, radius, texSize, colors, token.id, { showRing: false });
  else if (style === 'bottomHalf')   tick = buildDropsTick(container, radius, texSize, colors, token.id, { showRing: false, angleMin: 0, angleRange: Math.PI, maskShape: 'bottomRect', maskRadiusMultiplier: 1.1 });
  else                               tick = buildDropsTick(container, radius, texSize, colors, token.id, { showRing: true });

  canvas.app.ticker.add(tick);
  mesh.addChild(container);
  activeEffects.set(token.id, { container, mesh, tick });
}

function startSequencerEffect(token) {
  if (!game.modules.get('sequencer')?.active) {
    ui.notifications.warn('Blood Drip | Sequencer module is not active. Enable it or choose a different Blood Style.');
    return;
  }

  const filePath   = game.settings.get(MODULE_ID, 'jb2aFile')    || 'jb2a.liquid.blood.red.1';
  const scale      = game.settings.get(MODULE_ID, 'jb2aScale')   ?? 2.0;
  const opacity    = game.settings.get(MODULE_ID, 'jb2aOpacity') ?? 0.85;
  const gmOnly     = game.settings.get(MODULE_ID, 'gmOnly')      ?? false;
  const effectName = `blood-drip-${token.id}`;

  // Build the effect section. When gmOnly is set, .locally() is appended before
  // .play() so the chain always terminates on the Sequence, not a Section.
  const seq = new Sequence();
  const fx  = seq
    .effect()
      .file(filePath)
      .attachTo(token)
      .scaleToObject(scale)
      .persist()
      .name(effectName)
      .origin(MODULE_ID)   // tag with module ID so we can bulk-clear by origin on reload
      .opacity(opacity);

  if (gmOnly) fx.locally();

  seq.play();

  // Store a lightweight marker so we know this token has an active effect.
  activeEffects.set(token.id, { type: 'sequencer' });
}

function stopBloodDrip(tokenId) {
  const effect = activeEffects.get(tokenId);
  if (!effect) return;

  if (effect.type === 'sequencer') {
    Sequencer.EffectManager.endEffects({ name: `blood-drip-${tokenId}` });
    activeEffects.delete(tokenId);
    return;
  }

  canvas.app.ticker.remove(effect.tick);
  try {
    if (!effect.container.destroyed) {
      effect.mesh.removeChild(effect.container);
      effect.container.destroy({ children: true });
    }
  } catch (e) { /* already cleaned up by Foundry */ }
  activeEffects.delete(tokenId);
}

function refreshAllEffects() {
  const ids = [...activeEffects.keys()];
  for (const id of ids) stopBloodDrip(id);

  for (const token of canvas.tokens?.placeables ?? []) {
    const actor = token.actor;
    if (!actor || !actorPassesFilter(actor)) continue;
    const hp = actor.system?.attributes?.hp;
    if (!hp?.max) continue;
    if (hp.value / hp.max <= getThreshold() && hp.value > 0) startBloodDrip(token);
  }
}

// ── Shared Helpers ─────────────────────────────────────────────────────────────

/**
 * Applies a PIXI mask to the container so blood drops cannot bleed into
 * adjacent grid squares. Supports two shapes:
 *   'circle'    — circular clip matching the token's circular border.
 *   'bottomRect'— rectangle covering the lower half of the token plus
 *                 overflow space below; ideal for Bottom Half style so drops
 *                 spawn from the arc and fall straight down without being
 *                 clipped by a circle.
 *
 * @param {PIXI.Container} container
 * @param {number}         radius       Token border radius (texSize × 0.48).
 * @param {string}         [maskShape]  'circle' (default) | 'bottomRect'
 */
function applyBloodMask(container, radius, maskShape = 'circle') {
  if (!(game.settings.get(MODULE_ID, 'containBlood') ?? true)) return;

  const mask = new PIXI.Graphics();
  mask.beginFill(0xFFFFFF, 1);

  if (maskShape === 'bottomRect') {
    // Covers from the horizontal midline of the token downward.
    // Width  = full token diameter (−radius … +radius).
    // Height = radius × maskRadiusMultiplier passed in via the radius arg
    //          (caller already baked the multiplier into radius here).
    // This matches the yellow "allowed zone" in the design sketch.
    mask.drawRect(-radius, 0, radius * 2, radius);
  } else {
    mask.drawCircle(0, 0, radius);
  }

  mask.endFill();
  container.addChild(mask);
  container.mask = mask;
}

/**
 * Creates a scrolling noise displacement sprite + soft blur filter on the container,
 * giving drops an organic liquid quality. The noise sprite is stored on the container
 * so tick functions can animate it each frame.
 */
function applyLiquidFilters(container, texSize) {
  if (!(game.settings.get(MODULE_ID, 'liquidFilters') ?? true)) return;

  // Build a random noise texture via an offscreen canvas.
  const size   = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx    = canvas.getContext('2d');
  const img    = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v        = Math.random() * 255;
    img.data[i]    = v;   // R — drives X displacement
    img.data[i+1]  = v;   // G — drives Y displacement
    img.data[i+2]  = 128;
    img.data[i+3]  = 255;
  }
  ctx.putImageData(img, 0, 0);

  const tex = PIXI.Texture.from(canvas);
  tex.baseTexture.wrapMode = PIXI.WRAP_MODES.REPEAT;

  const noiseSprite   = new PIXI.Sprite(tex);
  noiseSprite.width   = texSize;
  noiseSprite.height  = texSize;
  noiseSprite.x       = -(texSize / 2);
  noiseSprite.y       = -(texSize / 2);
  container.addChild(noiseSprite);

  const dispFilter        = new PIXI.filters.DisplacementFilter(noiseSprite);
  dispFilter.scale.set(3);                     // subtle wobble — keeps drops defined

  const blurFilter        = new PIXI.filters.BlurFilter(1, 2);

  container.filters       = [dispFilter, blurFilter];
  container._noiseSprite  = noiseSprite;       // store for animation in tick
}

// ── Style: Dripping Drops ──────────────────────────────────────────────────────
// Teardrop beads spawn along the full circular border (bottom 270° weighted)
// and fall straight down, elongating as they go.

function buildDropsTick(container, radius, texSize, colors, tokenId, {
  showRing              = true,
  angleMin              = Math.PI * 0.17,   // default: bottom 270° sweep
  angleRange            = Math.PI * 1.67,
  maskShape             = 'circle',         // 'circle' | 'bottomRect'
  maskRadiusMultiplier  = 1.0,              // scales the mask size
  spawnRadiusMultiplier = 1.0,              // <1.0 shifts spawn point inward from token edge
} = {}) {
  applyBloodMask(container, radius * maskRadiusMultiplier, maskShape);
  applyLiquidFilters(container, texSize);

  const spawnR = radius * spawnRadiusMultiplier;

  if (showRing) {
    const ring = new PIXI.Graphics();
    ring.lineStyle(texSize * 0.012, colors.secondary, 0.3);
    ring.drawCircle(0, 0, radius);
    container.addChild(ring);
  }

  const count      = game.settings.get(MODULE_ID, 'dropCount')      ?? 12;
  const speedMult  = game.settings.get(MODULE_ID, 'dropSpeed')      ?? 1.0;
  const continuous = game.settings.get(MODULE_ID, 'continuousFlow') ?? false;

  const drops = [];
  for (let i = 0; i < count; i++) {
    const d = spawnDrop(container, radius, texSize, colors, false, angleMin, angleRange, spawnR);
    d.y += Math.random() * texSize * 0.9;
    drops.push(d);
  }

  function tick() {
    if (container.destroyed) {
      canvas.app.ticker.remove(tick);
      activeEffects.delete(tokenId);
      return;
    }
    if (container._noiseSprite) {
      container._noiseSprite.x += 0.04;
      container._noiseSprite.y += 0.07;
    }
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      if (d.destroyed) { drops.splice(i, 1); continue; }
      d.y += d._speed * speedMult;
      if (continuous) {
        d.scale.y += 0.005;
        if (d.y >= d._originY + d._maxFall) {
          d.x = d._originX; d.y = d._originY;
          d.scale.y = 1; d.alpha = 0.9 + Math.random() * 0.1;
        }
      } else {
        d.alpha   -= 0.005;
        d.scale.y += 0.02;
        if (d.alpha <= 0) {
          container.removeChild(d); d.destroy(); drops.splice(i, 1);
          drops.push(spawnDrop(container, radius, texSize, colors, false, angleMin, angleRange, spawnR));
        }
      }
    }
  }

  return tick;
}

// ── Style: Liquid Border ───────────────────────────────────────────────────────
// A thick ring redrawn every frame with overlapping sine waves to create a
// wobbling, liquid look. A handful of slow drips trail off the bottom.

function buildLiquidBorderTick(container, radius, texSize, colors, tokenId) {
  applyBloodMask(container, radius);
  applyLiquidFilters(container, texSize);

  const border  = new PIXI.Graphics();
  container.addChild(border);

  const waveAmp   = texSize * 0.022;
  const count     = Math.floor((game.settings.get(MODULE_ID, 'dropCount') ?? 12) * 0.6);
  const speedMult = game.settings.get(MODULE_ID, 'dropSpeed')      ?? 1.0;
  const continuous = game.settings.get(MODULE_ID, 'continuousFlow') ?? false;
  const drops     = [];
  for (let i = 0; i < count; i++) {
    const d = spawnDrop(container, radius, texSize, colors, /* slow */ true);
    d.y += Math.random() * texSize * 0.6;
    drops.push(d);
  }

  let phase = 0;

  function tick() {
    if (container.destroyed) {
      canvas.app.ticker.remove(tick);
      activeEffects.delete(tokenId);
      return;
    }

    phase += 0.035;
    if (container._noiseSprite) {
      container._noiseSprite.x += 0.04;
      container._noiseSprite.y += 0.07;
    }

    border.clear();
    border.lineStyle(texSize * 0.035, colors.primary, 0.8);
    const numPts = 72;
    let first = true;
    for (let i = 0; i <= numPts; i++) {
      const angle = (i / numPts) * Math.PI * 2;
      const wave  = Math.sin(angle * 5 + phase)       * waveAmp
                  + Math.sin(angle * 3 - phase * 0.8) * (waveAmp * 0.5)
                  + Math.sin(angle * 8 + phase * 1.4) * (waveAmp * 0.25);
      const r = radius + wave;
      const x = r * Math.cos(angle);
      const y = r * Math.sin(angle);
      if (first) { border.moveTo(x, y); first = false; }
      else        border.lineTo(x, y);
    }

    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      if (d.destroyed) { drops.splice(i, 1); continue; }
      d.y += d._speed * speedMult;
      if (continuous) {
        d.scale.y += 0.004;
        if (d.y >= d._originY + d._maxFall) {
          d.x = d._originX; d.y = d._originY;
          d.scale.y = 1; d.alpha = 0.9 + Math.random() * 0.1;
        }
      } else {
        d.alpha   -= 0.004;
        d.scale.y += 0.015;
        if (d.alpha <= 0) {
          container.removeChild(d); d.destroy(); drops.splice(i, 1);
          drops.push(spawnDrop(container, radius, texSize, colors, true));
        }
      }
    }
  }

  return tick;
}

// ── Shared Spawners ────────────────────────────────────────────────────────────

/**
 * Teardrop drop along the full border (bottom 270° weighted).
 * Pass slow=true to reduce fall speed for the liquid border style.
 */
function spawnDrop(container, radius, texSize, colors, slow = false, angleMin = Math.PI * 0.17, angleRange = Math.PI * 1.67, spawnRadius = null) {
  const sr    = spawnRadius ?? radius;   // where the drop appears; radius still governs fall distance
  const angle = angleMin + Math.random() * angleRange;
  const g     = new PIXI.Graphics();
  const w     = texSize * (0.006 + Math.random() * 0.008);
  const h     = texSize * (0.02  + Math.random() * 0.03);
  const color = Math.random() < 0.65 ? colors.primary : colors.secondary;

  g.beginFill(color, 0.8 + Math.random() * 0.2);
  g.moveTo(0, -h * 0.3);
  g.bezierCurveTo( w, -h * 0.05,  w,  h * 0.35,  0,  h * 0.6);
  g.bezierCurveTo(-w,  h * 0.35, -w, -h * 0.05,  0, -h * 0.3);
  g.endFill();

  g.x        = sr * Math.cos(angle);
  g.y        = sr * Math.sin(angle);
  g.alpha    = 0.9 + Math.random() * 0.1;
  g._speed   = slow ? 0.3 + Math.random() * 0.5 : 0.6 + Math.random() * 1.3;
  g._originX = g.x;
  g._originY = g.y;
  g._maxFall = radius * (1.0 + Math.random() * 0.8); // travel distance before looping

  container.addChild(g);
  return g;
}

// ── [EXPERIMENTAL] Death Blood Pool ───────────────────────────────────────────

function triggerDeathEffect(token) {
  if (!(game.settings.get(MODULE_ID, 'deathEffect') ?? false)) return;
  const maxPools = game.settings.get(MODULE_ID, 'deathPoolMax') ?? 3;
  if (activeDeathPools.has(token.id)) return;

  // Impact animation always plays; pool is skipped if cap is 0 or reached.
  buildDeathSplat(token, maxPools > 0 && activeDeathPools.size < maxPools);
}

/**
 * Plays a radial impact animation then, if showPool, grows an organic blood pool
 * over 30 s (wall-aware via mask). When spreading finishes the fresh pool fades
 * over 4 s and a dry dark stain is left for 60 more seconds before fading out.
 */
function buildDeathSplat(token, showPool) {
  const colors   = getColors();
  const gridSize = canvas.grid.size;
  const cx       = token.x + token.w / 2;
  const cy       = token.y + token.h / 2;
  const maxR     = gridSize * 1.5;

  const container = new PIXI.Container();
  container.position.set(cx, cy);
  canvas.tokens.addChildAt(container, 0);

  // ── Impact animation ────────────────────────────────────────────────────────
  playImpactAnimation(container, gridSize, colors);

  if (!showPool) return;

  // ── Wall mask ───────────────────────────────────────────────────────────────
  try {
    const poly = ClockwiseSweepPolygon.create({ x: cx, y: cy }, {
      radius: maxR,
      type:   'move',
    });
    if (poly?.points?.length >= 6) {
      const maskGfx = new PIXI.Graphics();
      maskGfx.beginFill(0xFFFFFF, 1);
      maskGfx.moveTo(poly.points[0] - cx, poly.points[1] - cy);
      for (let i = 2; i < poly.points.length; i += 2) {
        maskGfx.lineTo(poly.points[i] - cx, poly.points[i + 1] - cy);
      }
      maskGfx.closePath();
      maskGfx.endFill();
      container.addChild(maskGfx);
      container.mask = maskGfx;
    }
  } catch (e) {
    console.warn(`${MODULE_ID} | Wall polygon failed — no mask applied`, e);
  }

  // ── Irregular arms ──────────────────────────────────────────────────────────
  const NUM_ARMS  = 36;
  const SPREAD_MS = 30_000;
  const arms      = Array.from({ length: NUM_ARMS }, (_, i) => ({
    angle:    (i / NUM_ARMS) * Math.PI * 2,
    targetR:  maxR * (0.55 + Math.random() * 0.45),
    growRate: 0.35 + Math.random() * 0.65,
    currentR: 0,
  }));

  const poolGfx   = new PIXI.Graphics();
  container.addChild(poolGfx);

  const startTime = performance.now();
  let spreading   = true;

  const spreadTick = () => {
    if (container.destroyed) { canvas.app.ticker.remove(spreadTick); return; }

    const elapsed      = performance.now() - startTime;
    const baseProgress = Math.min(1, elapsed / SPREAD_MS);
    let   allDone      = true;

    for (const arm of arms) {
      const p = Math.min(1, baseProgress * arm.growRate * 1.8);
      arm.currentR = arm.targetR * deathEaseOut(p);
      if (p < 1) allDone = false;
    }

    drawBloodBlob(poolGfx, arms, colors.primary, 0.38);

    if (allDone && spreading) {
      spreading = false;
      canvas.app.ticker.remove(spreadTick);
      beginDryPhase(container, arms, colors, poolGfx, token.id);
    }
  };
  canvas.app.ticker.add(spreadTick);

  // Safety net in case allDone never fires.
  const fadeTimeout = setTimeout(() => {
    if (spreading) { canvas.app.ticker.remove(spreadTick); spreading = false; }
    beginDryPhase(container, arms, colors, poolGfx, token.id);
  }, SPREAD_MS + 2_000);

  activeDeathPools.set(token.id, { container, fadeTimeout });
}

/**
 * Plays a one-shot radial impact: thin spike triangles + scattered droplets,
 * fading out over ~1.5 s. Replaces the old expanding-circle burst.
 */
function playImpactAnimation(container, gridSize, colors) {
  const impactGfx  = new PIXI.Graphics();
  const NUM_SPIKES = 16;
  const NUM_DROPS  = 14;

  // Radial spikes — thin triangles pointing outward.
  impactGfx.beginFill(colors.primary, 0.92);
  for (let i = 0; i < NUM_SPIKES; i++) {
    const angle  = (i / NUM_SPIKES) * Math.PI * 2 + (Math.random() - 0.5) * 0.45;
    const length = gridSize * (0.35 + Math.random() * 0.75);
    const half   = gridSize * 0.055;
    const ex     = length * Math.cos(angle);
    const ey     = length * Math.sin(angle);
    const lx     =  half  * Math.cos(angle + Math.PI / 2);
    const ly     =  half  * Math.sin(angle + Math.PI / 2);
    impactGfx.moveTo( lx,  ly);
    impactGfx.lineTo(ex, ey);
    impactGfx.lineTo(-lx, -ly);
    impactGfx.closePath();
  }
  impactGfx.endFill();

  // Scattered droplets around the impact point.
  for (let i = 0; i < NUM_DROPS; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist  = gridSize * (0.15 + Math.random() * 0.9);
    const r     = gridSize * (0.03 + Math.random() * 0.06);
    impactGfx.beginFill(colors.primary, 0.7 + Math.random() * 0.3);
    impactGfx.drawCircle(
      dist * Math.cos(angle),
      dist * Math.sin(angle),
      r,
    );
    impactGfx.endFill();
  }

  container.addChild(impactGfx);

  const IMPACT_MS  = 1_500;
  const impactStart = performance.now();
  const impactTick  = () => {
    if (impactGfx.destroyed) { canvas.app.ticker.remove(impactTick); return; }
    const t = (performance.now() - impactStart) / IMPACT_MS;
    impactGfx.alpha = Math.max(0, 1 - t);
    if (t >= 1) {
      canvas.app.ticker.remove(impactTick);
      if (!container.destroyed) { container.removeChild(impactGfx); impactGfx.destroy(); }
    }
  };
  canvas.app.ticker.add(impactTick);
}

/** Draws a smooth organic blob through the arm tips using quadratic bezier curves. */
function drawBloodBlob(gfx, arms, color, alpha) {
  const pts = arms.map(a => ({
    x: a.currentR * Math.cos(a.angle),
    y: a.currentR * Math.sin(a.angle),
  }));
  const n = pts.length;

  gfx.clear();
  gfx.beginFill(color, alpha);
  gfx.moveTo((pts[n - 1].x + pts[0].x) / 2, (pts[n - 1].y + pts[0].y) / 2);
  for (let i = 0; i < n; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % n];
    gfx.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
  }
  gfx.closePath();
  gfx.endFill();
}

/**
 * Called when spreading finishes. Fades the fresh pool over 4 s while drawing a
 * darker dry stain at the same shape. The dry stain lingers for 60 s then fades.
 */
function beginDryPhase(container, arms, colors, poolGfx, tokenId) {
  const POOL_FADE_MS = 4_000;
  const DRY_LINGER_MS = 60_000;
  const DRY_FADE_MS  = 4_000;

  // Draw the dry stain immediately at the final arm positions.
  const dryGfx = new PIXI.Graphics();
  container.addChildAt(dryGfx, 0); // below the fresh pool
  drawBloodBlob(dryGfx, arms, colors.secondary, 0.25);

  // Fade fresh pool.
  const poolStart = performance.now();
  const poolFadeTick = () => {
    if (poolGfx.destroyed) { canvas.app.ticker.remove(poolFadeTick); return; }
    const t = (performance.now() - poolStart) / POOL_FADE_MS;
    poolGfx.alpha = Math.max(0, 1 - t);
    if (t >= 1) {
      canvas.app.ticker.remove(poolFadeTick);
      if (!poolGfx.destroyed) { container.removeChild(poolGfx); poolGfx.destroy(); }
    }
  };
  canvas.app.ticker.add(poolFadeTick);

  // After dry stain lingers, fade container and destroy.
  const dryTimeout = setTimeout(() => {
    if (container.destroyed) return;
    const dryStart    = performance.now();
    const dryFadeTick = () => {
      if (container.destroyed) { canvas.app.ticker.remove(dryFadeTick); return; }
      const t = (performance.now() - dryStart) / DRY_FADE_MS;
      container.alpha = Math.max(0, 1 - t);
      if (t >= 1) {
        canvas.app.ticker.remove(dryFadeTick);
        try {
          if (!container.destroyed) {
            canvas.tokens.removeChild(container);
            container.destroy({ children: true });
          }
        } catch (_) {}
        activeDeathPools.delete(tokenId);
      }
    };
    canvas.app.ticker.add(dryFadeTick);
  }, DRY_LINGER_MS);

  // Update the pool entry so clearAllDeathPools can cancel the dry timeout too.
  const entry = activeDeathPools.get(tokenId);
  if (entry) {
    clearTimeout(entry.fadeTimeout);
    entry.fadeTimeout = dryTimeout;
  }
}


/** Ease-out curve used by the death pool spread animation. */
function deathEaseOut(t) {
  return 1 - Math.pow(1 - t, 2.2);
}

/** Wipes all tracked death pools (called on canvas reload). */
function clearAllDeathPools() {
  for (const [, pool] of activeDeathPools) {
    clearTimeout(pool.fadeTimeout);
    try { if (!pool.container.destroyed) pool.container.destroy({ children: true }); } catch (_) {}
  }
  activeDeathPools.clear();
}

