/**
 * The SDK bundle never includes React. Each import below resolves at runtime to
 * the host app's React, which the SDK package puts on these globals.
 *
 * @type {Readonly<{
 *   react: "METABASE_REACT";
 *   "react/jsx-runtime": "METABASE_REACT_JSX_RUNTIME";
 *   "react-dom": "METABASE_REACT_DOM";
 *   "react-dom/client": "METABASE_REACT_DOM_CLIENT";
 *   "react-dom/server": "METABASE_REACT_DOM_SERVER";
 * }>}
 */
module.exports.EXTERNAL_DEPENDENCIES = {
  react: "METABASE_REACT",
  "react/jsx-runtime": "METABASE_REACT_JSX_RUNTIME",
  "react-dom": "METABASE_REACT_DOM",
  "react-dom/client": "METABASE_REACT_DOM_CLIENT",
  "react-dom/server": "METABASE_REACT_DOM_SERVER",
};
