import {
  type Token,
  type TokenStages,
  isAndToken,
  isCloseToken,
  isOpenToken,
  isOrToken,
  isPillToken,
} from "./types";
import { connectorToken } from "./utils";

const startsOperand = <F>(token: Token<F>) =>
  isPillToken(token) || isOpenToken(token);

const endsOperand = <F>(token: Token<F> | undefined) =>
  isPillToken(token) || isCloseToken(token);

const writeOutAnds = <F>(tokens: readonly Token<F>[]): Token<F>[] =>
  tokens.flatMap((token, index) =>
    startsOperand(token) && endsOperand(tokens[index - 1])
      ? [connectorToken("and"), token]
      : [token],
  );

// Product doc: pills side by side are AND-ed, and the AND stays hidden until
// there is an OR; then all ANDs show. Stages can't share an OR, so each stage
// decides on its own.
export const applyImplicitAnds = <F>(stages: TokenStages<F>): TokenStages<F> =>
  stages.map((tokens) =>
    tokens.some(isOrToken)
      ? writeOutAnds(tokens)
      : tokens.filter((token) => !isAndToken(token)),
  );
