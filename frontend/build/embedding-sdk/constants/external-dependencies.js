/**
 * The SDK should never bundle React itself
 *
 * @type {Readonly<{
 *   react: "React";
 *   "react/jsx-runtime": "ReactJSXRuntime";
 *   "react-dom": "ReactDOM";
 *   "react-dom/client": "ReactDOMClient";
 *   "react-dom/server": "ReactDOMServer";
 * }>}
 */
module.exports.EXTERNAL_DEPENDENCIES = {
  react: "React",
  "react/jsx-runtime": "ReactJSXRuntime",
  "react-dom": "ReactDOM",
  "react-dom/client": "ReactDOMClient",
  "react-dom/server": "ReactDOMServer",
};
