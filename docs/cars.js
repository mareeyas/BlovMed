// BlovMed garage: original cartoon cars (all face right, same 120x60 box so the game treats them the same).
export const COLORS = ['#E8559B', '#D62839', '#2E7D32', '#1E5BD8', '#F4B400', '#7B3FE4', '#F5F5F5', '#2B2B2B'];
export const COLOR_NAMES = ['Pink', 'Red', 'Green', 'Blue', 'Yellow', 'Purple', 'White', 'Black'];
const GL = '#CFE9FF';
const wheel = (x, r = 9) => `<circle cx="${x}" cy="${58 - r}" r="${r}" fill="#262626"/><circle cx="${x}" cy="${58 - r}" r="${r * .45}" fill="#C9C9C9"/><circle cx="${x}" cy="${58 - r}" r="${r * .15}" fill="#888"/>`;
const lights = (fx, rx, y) => `<rect x="${fx - 5}" y="${y}" width="6" height="5" rx="2" fill="#FFF3B0" stroke="#fff" stroke-width="1"/><rect x="${rx}" y="${y}" width="4" height="6" rx="1.5" fill="#FF5A5A"/>`;
const shade = (x1, x2) => `<rect x="${x1}" y="43" width="${x2 - x1}" height="4" fill="rgba(0,0,0,.18)"/>`;
const svg = inner => `<svg viewBox="0 0 120 60" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;

export const CAR_MODELS = [
  { id: 'bubble', group: 'cars', name: 'Bubble', type: 'City hatchback', draw: c => svg(`
    <path d="M10 44 Q10 30 20 29 L30 28 L40 15 Q42 13 46 13 L72 13 Q76 13 79 16 L90 28 L104 30 Q110 31 110 38 L110 45 Q110 48 107 48 L13 48 Q10 48 10 44Z" fill="${c}"/>
    <path d="M33 27 L42 17 L58 17 L58 27Z M62 17 L74 17 Q76 17 78 19 L85 27 L62 27Z" fill="${GL}"/>
    ${shade(12, 108)}${lights(110, 10, 33)}${wheel(30)}${wheel(90)}`) },
  { id: 'pebble', group: 'cars', name: 'Pebble 4x4', type: 'Little off-roader', draw: c => svg(`
    <circle cx="12" cy="31" r="8" fill="#333"/><circle cx="12" cy="31" r="3.5" fill="#777"/>
    <path d="M16 46 L16 12 Q16 8 20 8 L76 8 Q79 8 80 10 L86 24 L100 25 Q103 26 103 30 L103 46 Q103 48 100 48 L18 48 Q16 48 16 46Z" fill="${c}"/>
    <path d="M21 12 L44 12 L44 22 L21 22Z M48 12 L76 12 L82 22 L48 22Z" fill="${GL}"/>
    <rect x="16" y="36" width="87" height="3" fill="rgba(0,0,0,.15)"/>${shade(16, 103)}${lights(103, 16, 29)}${wheel(33, 10)}${wheel(86, 10)}`) },
  { id: 'grizzly', group: 'cars', name: 'Grizzly', type: 'Big 4x4 SUV', draw: c => svg(`
    <rect x="14" y="4" width="70" height="3" rx="1.5" fill="#555"/><rect x="20" y="6" width="2" height="3" fill="#555"/><rect x="76" y="6" width="2" height="3" fill="#555"/>
    <path d="M8 46 L8 12 Q8 8 12 8 L86 8 Q89 8 90 10 L98 26 L110 27 Q113 28 113 32 L113 46 Q113 48 110 48 L10 48 Q8 48 8 46Z" fill="${c}"/>
    <path d="M13 12 L34 12 L34 24 L13 24Z M38 12 L60 12 L60 24 L38 24Z M64 12 L86 12 L93 24 L64 24Z" fill="${GL}"/>
    ${shade(8, 113)}${lights(113, 8, 31)}${wheel(28, 10)}${wheel(94, 10)}`) },
  { id: 'summit', group: 'cars', name: 'Summit', type: 'Luxury SUV', draw: c => svg(`
    <path d="M6 46 L6 16 Q6 11 11 11 L84 11 Q88 11 90 14 L99 27 L112 29 Q115 30 115 35 L115 46 Q115 48 112 48 L8 48 Q6 48 6 46Z" fill="${c}"/>
    <path d="M11 15 L32 15 L32 26 L11 26Z M36 15 L58 15 L58 26 L36 26Z M62 15 L84 15 L92 26 L62 26Z" fill="${GL}"/>
    <rect x="8" y="36" width="105" height="2" fill="#E8E8E8"/>${shade(6, 115)}${lights(115, 6, 30)}${wheel(28, 10)}${wheel(96, 10)}`) },
  { id: 'volt', group: 'cars', name: 'Volt', type: 'Electric crossover', draw: c => svg(`
    <path d="M8 45 Q8 32 20 30 L36 26 Q48 12 66 12 L78 12 Q92 13 100 26 L108 29 Q114 31 114 40 L114 45 Q114 48 111 48 L11 48 Q8 48 8 45Z" fill="${c}"/>
    <path d="M42 25 Q51 16 62 16 L62 25Z M66 16 L78 16 Q88 17 94 25 L66 25Z" fill="${GL}"/>
    <rect x="104" y="32" width="10" height="2.5" rx="1" fill="#BFF6FF"/><path d="M55 34 L51 40 L55 40 L52 46 L59 38 L55 38 L58 34Z" fill="#FFE45C"/>
    ${shade(9, 113)}<rect x="8" y="33" width="4" height="4" rx="1.5" fill="#FF5A5A"/>
    <circle cx="30" cy="49" r="9" fill="#262626"/><circle cx="30" cy="49" r="6" fill="#E6E6E6"/><circle cx="92" cy="49" r="9" fill="#262626"/><circle cx="92" cy="49" r="6" fill="#E6E6E6"/>`) },
  { id: 'family', group: 'cars', name: 'Family Van', type: 'Seven-seater', draw: c => svg(`
    <path d="M8 46 L8 13 Q8 9 12 9 L78 9 Q82 9 85 12 L100 26 L111 28 Q114 29 114 33 L114 46 Q114 48 111 48 L10 48 Q8 48 8 46Z" fill="${c}"/>
    <path d="M13 13 L30 13 L30 25 L13 25Z M34 13 L56 13 L56 25 L34 25Z M60 13 L78 13 Q80 13 82 15 L92 25 L60 25Z" fill="${GL}"/>
    <rect x="57" y="27" width="1.5" height="15" fill="rgba(0,0,0,.2)"/>${shade(8, 114)}${lights(114, 8, 31)}${wheel(28)}${wheel(94)}`) },
  { id: 'hauler', group: 'cars', name: 'Hauler', type: 'Pickup truck', draw: c => svg(`
    <path d="M8 46 L8 26 L46 26 L46 12 Q46 9 50 9 L80 9 Q83 9 85 12 L94 26 L110 27 Q114 28 114 33 L114 46 Q114 48 111 48 L10 48 Q8 48 8 46Z" fill="${c}"/>
    <rect x="8" y="24" width="38" height="3" rx="1" fill="rgba(0,0,0,.3)"/>
    <path d="M51 13 L64 13 L64 24 L51 24Z M68 13 L80 13 L88 24 L68 24Z" fill="${GL}"/>
    ${shade(8, 114)}${lights(114, 8, 30)}${wheel(28, 10)}${wheel(94, 10)}`) },
];


/* ---------- sports cars (original designs) ---------- */
CAR_MODELS.push(
  { id: 'blaze', group: 'sports', name: 'Blaze GT', type: 'Supercar', draw: c => svg(`
    <path d="M6 44 Q6 38 12 37 L40 33 L58 22 Q62 20 68 20 L82 21 Q90 22 98 30 L112 34 Q116 35 116 40 L116 45 Q116 48 113 48 L9 48 Q6 48 6 44Z" fill="${c}"/>
    <path d="M58 31 L65 24 L80 24 Q86 25 92 31Z" fill="#1E2A38"/><path d="M40 38 L60 36 L58 42 L44 42Z" fill="rgba(0,0,0,.35)"/>
    ${shade(8, 115)}<rect x="108" y="37" width="7" height="3" rx="1.5" fill="#FFF3B0"/><rect x="6" y="38" width="5" height="3" rx="1" fill="#FF3B3B"/>${wheel(28)}${wheel(94)}`) },
  { id: 'razor', group: 'sports', name: 'Razor R', type: 'Track car', draw: c => svg(`
    <rect x="3" y="22" width="24" height="3" rx="1" fill="#222"/><rect x="12" y="24" width="3" height="12" fill="#222"/>
    <path d="M6 45 Q6 38 14 36 L44 33 L60 24 Q64 22 70 22 L80 22 Q88 23 95 31 L112 35 Q116 36 116 41 L116 45 Q116 48 113 48 L9 48 Q6 48 6 45Z" fill="${c}"/>
    <path d="M60 32 L66 25 L80 25 Q86 26 91 32Z" fill="#1E2A38"/><rect x="6" y="39" width="110" height="3" fill="#fff" opacity=".85"/>
    <circle cx="48" cy="40" r="6" fill="#fff"/><text x="48" y="43" font-size="8" font-weight="700" text-anchor="middle" font-family="sans-serif" fill="#222">7</text>
    ${shade(8, 115)}<rect x="109" y="37" width="6" height="3" rx="1.5" fill="#FFF3B0"/>${wheel(28)}${wheel(94)}`) },
  { id: 'sunset', group: 'sports', name: 'Sunset', type: 'Classic roadster', draw: c => svg(`
    <path d="M8 44 Q8 36 16 35 L46 34 L50 30 Q53 28 56 30 L60 34 L104 34 Q114 35 114 42 L114 45 Q114 48 111 48 L11 48 Q8 48 8 44Z" fill="${c}"/>
    <path d="M62 34 L68 23" stroke="#CFE9FF" stroke-width="3" stroke-linecap="round"/><path d="M62 34 L68 23" stroke="#999" stroke-width="1"/>
    <rect x="12" y="40" width="100" height="1.5" fill="#E8E8E8"/>${shade(10, 113)}${lights(114, 8, 37)}${wheel(28)}${wheel(92)}`) },
  { id: 'flash', group: 'sports', name: 'Flash', type: 'Muscle coupe', draw: c => svg(`
    <path d="M6 46 L6 36 Q6 33 10 33 L34 31 L46 21 Q48 19 52 19 L74 19 Q78 19 81 22 L90 31 L112 33 Q116 34 116 38 L116 46 Q116 48 113 48 L8 48 Q6 48 6 46Z" fill="${c}"/>
    <path d="M44 30 L52 23 L62 23 L62 30Z M66 23 L76 23 L84 30 L66 30Z" fill="${GL}"/><rect x="92" y="30" width="10" height="3" rx="1" fill="#222"/>
    <rect x="6" y="36" width="110" height="2" fill="#fff" opacity=".9"/><rect x="6" y="40" width="110" height="2" fill="#fff" opacity=".9"/>
    ${shade(6, 116)}${lights(116, 6, 34)}${wheel(28, 10)}${wheel(94, 10)}`) },
);

/* ---------- famous battleships (simplified silhouettes; they sail on the sea scene) ---------- */
const HULL = '#5B6670', SUP = '#8A95A0', DARK = '#3E464E';
const ship = inner => `<svg viewBox="0 0 160 60" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
const hull = c => `<path d="M2 37 L150 37 L159 33 L152 46 Q150 50 144 50 L14 50 Q8 50 6 46Z" fill="${HULL}"/><path d="M7 47 L151 47 L150 49 Q149 50 144 50 L14 50 Q9 50 8 48Z" fill="${c}"/><rect x="4" y="36" width="148" height="1.5" fill="${DARK}"/>`;
const tur = (x, d = 1, y = 31) => `<rect x="${x - 7}" y="${y}" width="14" height="6" rx="3" fill="#6B7680"/><rect x="${d > 0 ? x + 5 : x - 19}" y="${y + 1}" width="14" height="1.6" fill="${DARK}"/><rect x="${d > 0 ? x + 5 : x - 19}" y="${y + 3.4}" width="14" height="1.6" fill="${DARK}"/>`;
const funnel = (x, w = 8, h = 16, rake = 0) => `<path d="M${x} 31 L${x + rake} ${31 - h} L${x + w + rake} ${31 - h} L${x + w} 31Z" fill="${HULL}"/><rect x="${x + rake}" y="${31 - h}" width="${w}" height="3" fill="#222"/>`;
const flag = (x, top, c) => `<rect x="${x}" y="${top}" width="1.2" height="${31 - top}" fill="${DARK}"/><path d="M${x + 1.2} ${top} L${x + 10} ${top + 3} L${x + 1.2} ${top + 6}Z" fill="${c}"/>`;
CAR_MODELS.push(
  { id: 'yamato', group: 'ships', kind: 'ship', name: 'Yamato', type: 'Japan · 1941', draw: c => ship(`${flag(84, 2, c)}${hull(c)}
    <path d="M44 31 L104 31 L100 26 L48 26Z" fill="${SUP}"/><path d="M74 26 L88 26 L86 10 L78 8 L76 14Z" fill="${SUP}"/><rect x="77" y="12" width="8" height="2" fill="${DARK}"/>
    ${funnel(58, 10, 15, -4)}${tur(112)}${tur(130, 1, 30)}${tur(28, -1)}`) },
  { id: 'bismarck', group: 'ships', kind: 'ship', name: 'Bismarck', type: 'Germany · 1940', draw: c => ship(`${flag(76, 4, c)}${hull(c)}
    <path d="M46 31 L100 31 L96 25 L50 25Z" fill="${SUP}"/><path d="M80 25 L92 25 L90 13 L82 12Z" fill="${SUP}"/>
    ${funnel(62, 10, 14)}${tur(110)}${tur(128, 1, 30)}${tur(36, -1)}${tur(20, -1, 30)}`) },
  { id: 'missouri', group: 'ships', kind: 'ship', name: 'USS Missouri', type: 'USA · 1944', draw: c => ship(`${flag(88, 3, c)}${hull(c)}
    <path d="M48 31 L104 31 L100 25 L52 25Z" fill="${SUP}"/><path d="M84 25 L98 25 L95 12 L87 11Z" fill="${SUP}"/>
    ${funnel(58, 8, 15)}${funnel(72, 8, 13)}${tur(114)}${tur(132, 1, 30)}${tur(30, -1)}`) },
  { id: 'dreadnought', group: 'ships', kind: 'ship', name: 'HMS Dreadnought', type: 'UK · 1906', draw: c => ship(`${hull(c)}
    <path d="M40 31 L108 31 L106 27 L42 27Z" fill="${SUP}"/>
    <path d="M90 31 L94 6 M98 31 L94 6 M94 31 L94 6" stroke="${DARK}" stroke-width="1.4"/><path d="M50 31 L54 10 M58 31 L54 10" stroke="${DARK}" stroke-width="1.4"/><path d="M95 6 L104 9 L95 12Z" fill="${c}"/>
    ${funnel(64, 7, 13)}${funnel(76, 7, 13)}${tur(120)}${tur(36, -1)}${tur(20, -1, 30)}<rect x="100" y="28" width="10" height="4" rx="2" fill="#6B7680"/><rect x="104" y="28" width="10" height="4" rx="2" fill="#6B7680" opacity=".7"/>`) },
  { id: 'hood', group: 'ships', kind: 'ship', name: 'HMS Hood', type: 'UK · 1920', draw: c => ship(`${flag(86, 3, c)}${hull(c)}
    <path d="M44 31 L104 31 L101 26 L47 26Z" fill="${SUP}"/><path d="M82 26 L96 26 L93 13 L85 12Z" fill="${SUP}"/>
    ${funnel(60, 8, 12)}${funnel(72, 8, 12)}${tur(114)}${tur(132, 1, 30)}${tur(34, -1)}${tur(18, -1, 30)}`) },
);
export const GROUPS = [['cars', '🚗 Cars'], ['sports', '🏎️ Sports cars'], ['ships', '⚓ Battleships']];
export const carById = id => CAR_MODELS.find(m => m.id === id) || CAR_MODELS[0];
