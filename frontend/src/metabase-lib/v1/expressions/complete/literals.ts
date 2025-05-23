import type { CompletionContext } from "@codemirror/autocomplete";

import { isFieldReference, isIdentifier, tokenAtPos } from "./util";

export function suggestLiterals() {
  return function (context: CompletionContext) {
    const source = context.state.doc.toString();
    const token = tokenAtPos(source, context.pos);

    if (!token || !isIdentifier(token) || isFieldReference(token)) {
      // Cursor is inside a field reference tag
      return null;
    }

    return {
      from: token.pos,
      to: token.pos + token.length,
      options: [
        {
          label: "True",
          type: "literal",
          icon: "io",
        },
        {
          label: "False",
          type: "literal",
          icon: "io",
        },
      ],
    };
  };
}
