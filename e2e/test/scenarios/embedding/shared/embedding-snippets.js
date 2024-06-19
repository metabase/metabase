export const getEmbeddingJsCode = ({
  type,
  id,
  hideDownloadButton,
  theme,
  // Match the actual default value (metabase#43838)
  background = true,
}) => {
  return new RegExp(
    `// you will need to install via 'npm install jsonwebtoken' or in your package.json

var jwt = require("jsonwebtoken");

var METABASE_SITE_URL = "http://localhost:PORTPORTPORT";
var METABASE_SECRET_KEY = "KEYKEYKEY";
var payload = {
  resource: { ${type}: ${id} },
  params: {},
  exp: Math.round(Date.now() / 1000) + (10 * 60) // 10 minute expiration
};
var token = jwt.sign(payload, METABASE_SECRET_KEY);

var iframeUrl = METABASE_SITE_URL + "/embed/${type}/" + token +
  "#${getThemeParameter(theme)}${getBackgroundParameter(
      background,
    )}bordered=true&titled=true${getParameter({
      hideDownloadButton,
    })}";`
      .split("\n")
      .join("")
      .replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")
      .replace("KEYKEYKEY", ".*")
      .replace("PORTPORTPORT", ".*"),
  );
};

export const IFRAME_CODE = `iframe(
    src=iframeUrl
    frameborder="0"
    width="800"
    height="600"
    allowtransparency
)`
  .split("\n")
  .join("");

function getThemeParameter(theme) {
  return theme ? `theme=${theme}&` : "";
}

/**
 *
 * @param {boolean} background
 */
function getBackgroundParameter(background) {
  return !background ? "background=false&" : "";
}

function getParameter({ hideDownloadButton }) {
  let parameter = "";

  if (hideDownloadButton) {
    parameter += "&hide_download_button=true";
  }

  return parameter;
}
