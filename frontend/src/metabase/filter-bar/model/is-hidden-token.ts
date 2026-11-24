import {
  type Token,
  isAndToken,
  isOrToken,
  isPillToken,
  isThenToken,
} from "./types";

export const isHiddenToken = <F>(
  tokens: readonly Token<F>[],
  index: number,
): boolean => {
  const token = tokens[index];
  if (isAndToken(token)) {
    const hasOr = tokens.some(isOrToken);
    return !hasOr;
  }
  if (isThenToken(token)) {
    const hasPillBefore = tokens.slice(0, index).some(isPillToken);
    return !hasPillBefore;
  }
  return false;
};
