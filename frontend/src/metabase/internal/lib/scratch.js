// $FlowFixMe: react-virtualized ignored
import reactElementToJSXString from "react-element-to-jsx-string";
import prettier from "prettier/standalone";
import prettierParserBabylon from "prettier/parser-babylon";
import { utf8_to_b64 } from "metabase/lib/card";

export function reactToSource(element) {
  let source = reactElementToJSXString(element, {
    showFunctions: true,
    showDefaultProps: false,
  });
  try {
    source = prettier.format(source, {
      parser: "babel",
      plugins: [prettierParserBabylon],
    });
  } catch (e) {
    console.log(e);
  }
  return source;
}

export function reactToScratchUrl(element) {
  return sourceToScratchUrl(reactToSource(element));
}

export function sourceToScratchUrl(source) {
  return "/_internal/scratch#" + utf8_to_b64(source);
}
