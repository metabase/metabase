import { t } from "ttag";

import { getClauseDefinition, getMBQLName } from "../../clause";
import { GROUP, IDENTIFIER, type Token } from "../../pratt";
import { error } from "../utils";

export function checkOpenParenthesisAfterFunction({
  tokens,
  source,
}: {
  tokens: Token[];
  source: string;
}) {
  for (let i = 0; i < tokens.length - 1; ++i) {
    const token = tokens[i];
    if (token.type === IDENTIFIER && source[token.start] !== "[") {
      const functionName = source.slice(token.start, token.end);
      const fn = getMBQLName(functionName);
      const clause = fn && getClauseDefinition(fn);
      if (clause && clause.args.length > 0) {
        const next = tokens[i + 1];
        if (next.type !== GROUP) {
          error(
            token,
            t`Expecting an opening parenthesis after function ${functionName}`,
          );
        }
      }
    }
  }
}
