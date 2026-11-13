Act as a senior web game developer and 3D graphics specialist. Before building, ask me up to 5 short questions ONLY if something essential is missing; otherwise start.

PROJECT: A complete, original 3D checkers (draughts) game for the browser, played against the computer or against a friend on the same device.
WHO IT IS FOR: Casual players of any age, on a phone (main target), tablet or computer. It will be part of a public portfolio that compares AI platforms, so it must work first time and look polished.
GOAL: One self-contained HTML file that a stranger can open on a phone and play a full, correct game of checkers in under 10 seconds, with no instructions needed.

TECHNICAL REQUIREMENTS
1. ONE self-contained HTML file (HTML, CSS and JavaScript together). No build step, no external images, no external audio files, no external fonts.
2. 3D with Three.js, loaded from a CDN with a pinned version, for example https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js. All models, textures and materials are generated in code (procedural wood grain via canvas textures is welcome). If the CDN is unreachable, show a short readable error message instead of a blank page.
3. Works on any device, in BOTH portrait and landscape. Full-screen responsive canvas that re-lays out on rotation. Never show a "please rotate" screen. Handle high-DPI screens, capping the pixel ratio at 2 for performance.
4. Controls: tap or click a piece to select it, tap or click a highlighted square to move. No keyboard needed. Dragging to rotate the camera must not conflict with selecting pieces: a short tap selects, a drag rotates, and two fingers (or the mouse wheel) zoom. Camera limits keep the board always visible. Provide a "reset view" button.
5. Smooth 60 fps on a mid-range phone. Keep it light: simple geometry, a small number of lights, no heavy post-processing. Shadows are optional and must be switchable off automatically if the frame rate drops.
6. Sound effects and music generated with the Web Audio API only: piece placed, capture, king promotion, win, lose, button click, and a calm looping background track. A mute button. Audio starts only after the first tap (browser rule).
7. Original title, names and look. No trademarked or copyrighted names, characters or logos.

RULES (American checkers, 8x8)
- 8x8 board, play on the dark squares only. Each side starts with 12 pieces. The player moves first with the light pieces; the computer plays dark.
- Normal pieces move one square diagonally forward. Kings move one square diagonally in any direction.
- Captures are made by jumping diagonally over an adjacent opponent piece to the empty square behind it.
- Captures are MANDATORY. If any capture is available, the player must make one. Highlight only the pieces that can capture.
- Multiple jumps in the same turn are mandatory: the same piece must keep jumping while it can. If a piece reaches the king row during a jump sequence, the turn ends there.
- A piece reaching the far row becomes a king (show a crown or a stacked disc).
- You win when the opponent has no pieces left or no legal move. Detect a draw: no capture and no king move for 40 moves, or the same position three times.
- Do not allow illegal moves under any circumstance. Test this carefully.

COMPUTER OPPONENT
- Three difficulty levels chosen on the start screen: Easy, Medium, Hard.
- Use minimax with alpha-beta pruning and a sensible evaluation function (piece count, kings weighted higher, advancement, back-row protection, centre control). Suggested depths: Easy 2 (with a small chance of a random legal move), Medium 5, Hard 8 to 10 with iterative deepening and a time limit of about 1 second per move on a phone.
- Run the search without freezing the screen: use a Web Worker built from a Blob, or split the search over animation frames, and show a short "thinking" indicator.
- The computer must always respect mandatory captures.

GAME MODES AND SCREENS
- Start screen: game title, Play vs Computer (with difficulty), Play with a friend (same device), Sound on/off.
- In game: whose turn it is, number of pieces left per side, last move highlighted, a clear highlight on selectable pieces and legal destination squares, smooth animated moves and captures (arc for jumps, short fade or tumble for captured pieces), crown animation for kings.
- Buttons: Undo (the last move for the player; in vs-computer mode undo both the computer move and the player move), New game, Menu, Reset view, Mute.
- End screen: win, lose or draw message, a Play again button, and a Menu button.
- Optional hint button that highlights one good move (uses the same engine).

VISUAL STYLE
- A modern, warm look: a wooden board on a table or a soft dark background, light and dark pieces with a subtle bevel, soft lighting, gentle camera intro. Clear contrast so pieces are easy to tell apart on a small screen, including for colour-blind players (use different shapes or a ring pattern on the dark pieces, not only colour).
- Large touch targets (at least 44 px) for all buttons. Readable text over the 3D scene.

LANGUAGES (important)
- Put ALL visible text in one object called STRINGS, keyed by language, so translations can be added later without touching the code. Provide English now. Keys to cover: title, play vs computer, play with a friend, difficulty names, your turn, computer is thinking, you win, you lose, draw, play again, menu, undo, new game, hint, mute, unmute, reset view, pieces left, mandatory capture message.
- Support right-to-left layouts for the UI text (Arabic) by using a dir attribute on the UI container; the 3D board does not change.
- Choose the language from the page URL parameter ?lang=xx when present, otherwise English.

QUALITY AND SAFETY
- No personal data, no cookies, no network calls other than loading Three.js. No localStorage needed; if you use it, wrap it in try/catch.
- Never freeze or throw errors on rotation, tab switch or window resize.
- Pause the music and animation when the tab is hidden.
- Add a small debug hook, window.__checkers = { getState(), newGame(), move(from, to), setDifficulty(n) }, so the game can be tested automatically.
- Include a self-test function that plays 200 random legal games at the start of development and checks that no illegal move is ever produced, that mandatory captures are honoured, and that every game ends. Run it and tell me the result.

OUT OF SCOPE
- Online multiplayer, accounts, ads, in-app purchases, other rule variants (international, Russian), save files.

DELIVER, in this order
1. Ask your questions first only if something essential is missing. Otherwise start.
2. The complete HTML file in a single code block (no placeholders, no "rest of the code here").
3. A short list of the assumptions you made.
4. The result of the self-test (how many games, any illegal move found).
5. Three improvements you would make with more time.
6. A checklist I can use to verify it on my phone: rotate the screen, tap to select, forced capture, multi-jump, king promotion, undo, each difficulty, sound and mute, win and draw screens.

If the file is too long for one reply, split it into numbered parts and say how to put them together, but keep it as one HTML file at the end.
