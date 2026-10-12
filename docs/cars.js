// BlovMed garage: original cartoon cars (all face right, same 120x60 box so the game treats them the same).
export const COLORS = ['#E8559B', '#D62839', '#2E7D32', '#1E5BD8', '#F4B400', '#7B3FE4', '#F5F5F5', '#2B2B2B'];
export const COLOR_NAMES = ['Pink', 'Red', 'Green', 'Blue', 'Yellow', 'Purple', 'White', 'Black'];
const GL = '#CFE9FF';
const wheel = (x, r = 9) => `<circle cx="${x}" cy="${58 - r}" r="${r}" fill="#262626"/><circle cx="${x}" cy="${58 - r}" r="${r * .45}" fill="#C9C9C9"/><circle cx="${x}" cy="${58 - r}" r="${r * .15}" fill="#888"/>`;
const lights = (fx, rx, y) => `<rect x="${fx - 5}" y="${y}" width="6" height="5" rx="2" fill="#FFF3B0" stroke="#fff" stroke-width="1"/><rect x="${rx}" y="${y}" width="4" height="6" rx="1.5" fill="#FF5A5A"/>`;
const shade = (x1, x2) => `<rect x="${x1}" y="43" width="${x2 - x1}" height="4" fill="rgba(0,0,0,.18)"/>`;
const svg = inner => `<svg viewBox="0 0 120 60" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;

export const CAR_MODELS = [
  { id: 'bubble', name: 'Bubble', type: 'City hatchback', draw: c => svg(`
    <path d="M10 44 Q10 30 20 29 L30 28 L40 15 Q42 13 46 13 L72 13 Q76 13 79 16 L90 28 L104 30 Q110 31 110 38 L110 45 Q110 48 107 48 L13 48 Q10 48 10 44Z" fill="${c}"/>
    <path d="M33 27 L42 17 L58 17 L58 27Z M62 17 L74 17 Q76 17 78 19 L85 27 L62 27Z" fill="${GL}"/>
    ${shade(12, 108)}${lights(110, 10, 33)}${wheel(30)}${wheel(90)}`) },
  { id: 'pebble', name: 'Pebble 4x4', type: 'Little off-roader', draw: c => svg(`
    <circle cx="12" cy="31" r="8" fill="#333"/><circle cx="12" cy="31" r="3.5" fill="#777"/>
    <path d="M16 46 L16 12 Q16 8 20 8 L76 8 Q79 8 80 10 L86 24 L100 25 Q103 26 103 30 L103 46 Q103 48 100 48 L18 48 Q16 48 16 46Z" fill="${c}"/>
    <path d="M21 12 L44 12 L44 22 L21 22Z M48 12 L76 12 L82 22 L48 22Z" fill="${GL}"/>
    <rect x="16" y="36" width="87" height="3" fill="rgba(0,0,0,.15)"/>${shade(16, 103)}${lights(103, 16, 29)}${wheel(33, 10)}${wheel(86, 10)}`) },
  { id: 'grizzly', name: 'Grizzly', type: 'Big 4x4 SUV', draw: c => svg(`
    <rect x="14" y="4" width="70" height="3" rx="1.5" fill="#555"/><rect x="20" y="6" width="2" height="3" fill="#555"/><rect x="76" y="6" width="2" height="3" fill="#555"/>
    <path d="M8 46 L8 12 Q8 8 12 8 L86 8 Q89 8 90 10 L98 26 L110 27 Q113 28 113 32 L113 46 Q113 48 110 48 L10 48 Q8 48 8 46Z" fill="${c}"/>
    <path d="M13 12 L34 12 L34 24 L13 24Z M38 12 L60 12 L60 24 L38 24Z M64 12 L86 12 L93 24 L64 24Z" fill="${GL}"/>
    ${shade(8, 113)}${lights(113, 8, 31)}${wheel(28, 10)}${wheel(94, 10)}`) },
  { id: 'summit', name: 'Summit', type: 'Luxury SUV', draw: c => svg(`
    <path d="M6 46 L6 16 Q6 11 11 11 L84 11 Q88 11 90 14 L99 27 L112 29 Q115 30 115 35 L115 46 Q115 48 112 48 L8 48 Q6 48 6 46Z" fill="${c}"/>
    <path d="M11 15 L32 15 L32 26 L11 26Z M36 15 L58 15 L58 26 L36 26Z M62 15 L84 15 L92 26 L62 26Z" fill="${GL}"/>
    <rect x="8" y="36" width="105" height="2" fill="#E8E8E8"/>${shade(6, 115)}${lights(115, 6, 30)}${wheel(28, 10)}${wheel(96, 10)}`) },
  { id: 'volt', name: 'Volt', type: 'Electric crossover', draw: c => svg(`
    <path d="M8 45 Q8 32 20 30 L36 26 Q48 12 66 12 L78 12 Q92 13 100 26 L108 29 Q114 31 114 40 L114 45 Q114 48 111 48 L11 48 Q8 48 8 45Z" fill="${c}"/>
    <path d="M42 25 Q51 16 62 16 L62 25Z M66 16 L78 16 Q88 17 94 25 L66 25Z" fill="${GL}"/>
    <rect x="104" y="32" width="10" height="2.5" rx="1" fill="#BFF6FF"/><path d="M55 34 L51 40 L55 40 L52 46 L59 38 L55 38 L58 34Z" fill="#FFE45C"/>
    ${shade(9, 113)}<rect x="8" y="33" width="4" height="4" rx="1.5" fill="#FF5A5A"/>
    <circle cx="30" cy="49" r="9" fill="#262626"/><circle cx="30" cy="49" r="6" fill="#E6E6E6"/><circle cx="92" cy="49" r="9" fill="#262626"/><circle cx="92" cy="49" r="6" fill="#E6E6E6"/>`) },
  { id: 'family', name: 'Family Van', type: 'Seven-seater', draw: c => svg(`
    <path d="M8 46 L8 13 Q8 9 12 9 L78 9 Q82 9 85 12 L100 26 L111 28 Q114 29 114 33 L114 46 Q114 48 111 48 L10 48 Q8 48 8 46Z" fill="${c}"/>
    <path d="M13 13 L30 13 L30 25 L13 25Z M34 13 L56 13 L56 25 L34 25Z M60 13 L78 13 Q80 13 82 15 L92 25 L60 25Z" fill="${GL}"/>
    <rect x="57" y="27" width="1.5" height="15" fill="rgba(0,0,0,.2)"/>${shade(8, 114)}${lights(114, 8, 31)}${wheel(28)}${wheel(94)}`) },
  { id: 'hauler', name: 'Hauler', type: 'Pickup truck', draw: c => svg(`
    <path d="M8 46 L8 26 L46 26 L46 12 Q46 9 50 9 L80 9 Q83 9 85 12 L94 26 L110 27 Q114 28 114 33 L114 46 Q114 48 111 48 L10 48 Q8 48 8 46Z" fill="${c}"/>
    <rect x="8" y="24" width="38" height="3" rx="1" fill="rgba(0,0,0,.3)"/>
    <path d="M51 13 L64 13 L64 24 L51 24Z M68 13 L80 13 L88 24 L68 24Z" fill="${GL}"/>
    ${shade(8, 114)}${lights(114, 8, 30)}${wheel(28, 10)}${wheel(94, 10)}`) },
];
export const carById = id => CAR_MODELS.find(m => m.id === id) || CAR_MODELS[0];
