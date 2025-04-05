import * as npm_52_stable from "sdk_52_stable";
import * as npm_53_stable from "sdk_53_stable";

// These are re-exported from here as this folder has its own package.json and node_modules folder
// when we import them from here, it will find them in ./node_modules, without having to install them in the root node_modules
// (where they would mess up with the deps of the main app)

export { npm_52_stable, npm_53_stable };
