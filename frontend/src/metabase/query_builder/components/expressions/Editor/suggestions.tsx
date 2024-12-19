import {
  type CompletionContext,
  autocompletion,
} from "@codemirror/autocomplete";

import { getColumnIcon } from "metabase/common/utils/columns";
import { type SuggestArgs, suggest } from "metabase-lib/v1/expressions/suggest";

type SuggestOptions = Omit<
  SuggestArgs,
  "source" | "targetOffset" | "getColumnIcon"
>;

export function suggestions(options: SuggestOptions) {
  return autocompletion({
    closeOnBlur: false,
    activateOnTyping: true,
    activateOnTypingDelay: 200,
    override: [wip(options)],
  });
}

function wip(options: SuggestOptions) {
  return function (context: CompletionContext) {
    const source = context.state.doc.toString();
    const targetOffset = context.pos;
    const { prefix, suggestions = [] } = suggest({
      ...options,
      source,
      targetOffset,
      getColumnIcon,
    });

    const isInsideReference = source.charAt(context.pos + 1) === "]";

    return {
      from: context.pos - prefix.length,
      to: isInsideReference ? context.pos + 1 : context.pos,
      options: suggestions.map(suggestion => {
        return {
          label: suggestion.text,
          icon: suggestion.icon,
        };
      }),
    };
  };
}
