const ts = () => new Date().toISOString().slice(11, 19);
export const info = (msg) => console.error(`[${ts()}] ${msg}`);
export const warn = (msg) => console.error(`[${ts()}] WARN  ${msg}`);
export const err  = (msg) => console.error(`[${ts()}] ERROR ${msg}`);
