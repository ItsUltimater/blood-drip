# Blood Drip

A Foundry VTT module for **Pathfinder 2e** that displays animated blood effects on tokens that fall below a configurable HP threshold.

![Foundry v13](https://img.shields.io/badge/Foundry-v13-informational)
![PF2e](https://img.shields.io/badge/System-PF2e-red)

---

## Features

- **Animated blood effects** appear automatically when a token's HP drops below a configurable threshold (default 25%)
- **Multiple visual styles** to choose from:
  - 🟢 Dripping Drops — teardrop beads along the full token border
  - 🟢 Dripping Drops (no border) — same drops without the circular ring
  - 🟢 Bottom Half — drops only from the lower semicircle, contained below the token
  - 🟡 Liquid Border — animated wavy blood ring that redraws each frame
  - 🔵 JB2A / Sequencer — plays a persistent high-quality animation from your JB2A library
- **Customizable blood colors** — Dark Red, Bright Red, Black, Green, or Blue
- **Chat alert** when a token crosses the threshold, with a fully customizable message using `{name}` as a placeholder
- **Sound effect** on threshold crossing with adjustable volume
- **Filter by token type** — apply the visual effect and/or chat alert to all tokens, PCs only, or NPCs only
- **Contain Blood** — clips the effect to the token boundary so it doesn't spill into adjacent grid squares
- **Continuous Flow mode** — blood streams flow perpetually instead of fading in and out
- **Liquid Filters** — GPU blur and displacement filters for an organic, liquid look
- **Performance presets** — Low, Medium, and High to suit any computer
- **Drop Count and Speed** controls for fine-tuning performance vs. visual density

---

## Requirements

- Foundry VTT v11–v13
- Pathfinder 2e system

### Optional (for JB2A style)
- [Sequencer](https://foundryvtt.com/packages/sequencer)
- [JB2A Free](https://foundryvtt.com/packages/JB2A_DnD5e)

---

## Installation

### Manual
1. Download the latest release zip from the [Releases](../../releases) page
2. In Foundry VTT, go to **Add-on Modules → Install Module**
3. Click **Install** at the bottom and paste the manifest URL:
   ```
   https://raw.githubusercontent.com/ItsUltimater/blood-drip/main/module.json
   ```

### Via Foundry Package Manager
Search for **Blood Drip** in the Foundry VTT module browser.

---

## Settings

| Setting | Description | Default |
|---|---|---|
| Quality Preset | Quickly tune all performance-sensitive settings | Low |
| HP Threshold (%) | HP percentage at which the effect activates | 25% |
| Blood Color | Color palette for the effect | Dark Red |
| Blood Style | Visual style of the blood effect | Dripping Drops (no border) |
| Apply Effect To | Which token types show the visual effect | All |
| Contain Blood to Token | Clips the effect to the token's boundary | On |
| Continuous Blood Flow | Perpetual flow instead of fading drops | Off |
| Liquid Filters | GPU blur + displacement for organic look | On |
| Drop Count | Number of simultaneous drops (PIXI styles) | 12 |
| Drop Speed | Speed multiplier for falling drops | 1.0 |
| Chat Alert on Threshold | Post a chat message when threshold is crossed | On |
| Chat Alert — Apply To | Which token types trigger the chat alert | PCs only |
| Chat Alert Message | Customizable alert text (`{name}` = token name) | ⚠ {name} is critically wounded and bleeding! |
| Threshold Sound Effect | Sound played on threshold crossing | sounds/notify.wav |
| Sound Effect Volume | Volume of the threshold sound | 0.8 |
| JB2A Animation Path | File or Sequencer DB path for JB2A style | jb2a.liquid.blood.red.1 |
| JB2A Animation Scale | Size of the JB2A animation relative to the token | 2.0 |
| JB2A Animation Opacity | Transparency of the JB2A animation | 0.85 |
| GM Only (JB2A) | Only the GM sees the JB2A effect | Off |

---

## Credits

Created by **ItsUltimater**

Inspired by the [Splatter](https://foundryvtt.com/packages/splatter) module by TheRipper93.

Optional animations provided by [JB2A Free](https://foundryvtt.com/packages/JB2A_DnD5e) via the [Sequencer](https://foundryvtt.com/packages/sequencer) module.

---

## License

This module is licensed under the [MIT License](LICENSE).
