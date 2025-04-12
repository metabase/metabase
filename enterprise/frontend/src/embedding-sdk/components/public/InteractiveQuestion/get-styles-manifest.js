const stylesManifest = require("./styles-manifest.json");
console.log("stylesManifest:", stylesManifest);

export const STYLE_PATHS = Object.values(stylesManifest);
