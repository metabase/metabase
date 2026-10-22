import { Lexer } from "marked";

const FOOTNOTE_PATTERN = /\[\^[^\]\s]+\]/;

// Splits markdown into top-level block sources for memoized rendering.
export const splitMarkdownBlocks = (source: string): string[] => {
  if (source === "") {
    return [];
  }

  if (FOOTNOTE_PATTERN.test(source)) {
    return [source];
  }

  try {
    const tokens = new Lexer({ gfm: true }).lex(source);

    // Reference definitions are document-scoped, so blocks can't resolve them alone.
    if (tokens.links && Object.keys(tokens.links).length > 0) {
      return [source];
    }

    return tokens.reduce<string[]>((acc, token) => {
      const isBlankLine = token.type === "space";
      if (isBlankLine && acc.length > 0) {
        acc[acc.length - 1] += token.raw;
      } else if (!isBlankLine) {
        acc.push(token.raw);
      }
      return acc;
    }, []);
  } catch {
    return [source];
  }
};
