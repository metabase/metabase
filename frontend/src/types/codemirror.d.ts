// Ambient declarations for CodeMirror packages whose `package.json` "exports"
// field omits the `types` condition, making them invisible to bundler-mode
// module resolution. We re-export the upstream `.d.ts` files directly.
//
// TODO: remove once the packages fix their package.json

declare module "@codemirror/lang-json" {
  export {
    json,
    jsonLanguage,
    jsonParseLinter,
  } from "../../../node_modules/@codemirror/lang-json/dist/index";
}

declare module "@codemirror/legacy-modes/mode/clojure" {
  export { clojure } from "../../../node_modules/@codemirror/legacy-modes/mode/clojure";
}

declare module "@codemirror/legacy-modes/mode/pug" {
  export { pug } from "../../../node_modules/@codemirror/legacy-modes/mode/pug";
}

declare module "@codemirror/legacy-modes/mode/ruby" {
  export { ruby } from "../../../node_modules/@codemirror/legacy-modes/mode/ruby";
}
