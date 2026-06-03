// Clean-room reimplementation of the "harden incomplete markdown" technique
// used by streaming-markdown renderers (e.g. Vercel's remend). While text is
// still streaming, the accumulated string is frequently mid-token: an open code
// fence, a dangling `**bold`, a half-typed `[label](http`. Feeding that straight
// to the parser makes earlier content flicker (literal asterisks, a fence that
// swallows the rest of the reply). repairMarkdown closes the minimal set of
// trailing constructs so the partial string parses the way the finished string
// will. It is only meant to run on in-flight streaming text — finished messages
// should be rendered verbatim.

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;

// True when the text ends inside an unterminated fenced code block. CommonMark
// closes such a block at the end of input, so the partial fence already renders
// as code — we leave the whole string untouched rather than try to close
// emphasis that lives inside (incomplete) code.
const hasOpenFence = (text: string): boolean => {
  let fenceChar: string | null = null;
  let fenceLen = 0;
  for (const line of text.split("\n")) {
    const match = line.match(FENCE_RE);
    if (!match) {
      continue;
    }
    const marker = match[1];
    if (fenceChar == null) {
      fenceChar = marker[0];
      fenceLen = marker.length;
    } else if (marker[0] === fenceChar && marker.length >= fenceLen) {
      fenceChar = null;
      fenceLen = 0;
    }
  }
  return fenceChar != null;
};

const isEscaped = (text: string, index: number): boolean => {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) {
    backslashes++;
  }
  return backslashes % 2 === 1;
};

// Replace the *contents* of completed inline-code spans and link/image
// destinations with spaces, so delimiter counting and intraword checks only see
// real prose. Lengths are preserved (space-for-char) so the masked string stays
// index-aligned with the original; we only ever append to the original, never
// splice by masked index.
const maskForCounting = (text: string): string => {
  const chars = text.split("");

  // inline code: equal-length backtick runs. An unpaired trailing run is left
  // visible so repairInlineCode can close it.
  let i = 0;
  while (i < chars.length) {
    if (chars[i] === "`" && !isEscaped(text, i)) {
      let run = 0;
      while (chars[i + run] === "`") {
        run++;
      }
      const openStart = i;
      const openEnd = i + run;
      let j = openEnd;
      let closed = false;
      while (j < chars.length) {
        if (chars[j] === "`") {
          let closeRun = 0;
          while (chars[j + closeRun] === "`") {
            closeRun++;
          }
          if (closeRun === run) {
            for (let k = openStart; k < j + closeRun; k++) {
              chars[k] = " ";
            }
            i = j + closeRun;
            closed = true;
            break;
          }
          j += closeRun;
        } else {
          j++;
        }
      }
      if (!closed) {
        break;
      }
    } else {
      i++;
    }
  }

  // link / image destinations: mask the url inside a completed `](...)`.
  const masked = chars.join("");
  return masked.replace(
    /\]\(([^)]*)\)/g,
    (_, url: string) => `](${" ".repeat(url.length)})`,
  );
};

const repairInlineCode = (text: string): string => {
  let runs = 0;
  let i = 0;
  while (i < text.length) {
    if (text[i] === "`" && !isEscaped(text, i)) {
      let run = 0;
      while (text[i + run] === "`") {
        run++;
      }
      runs++;
      i += run;
    } else {
      i++;
    }
  }
  if (runs % 2 === 1) {
    // close with a single backtick — the common case is an unclosed `code` span
    return `${text}\``;
  }
  return text;
};

// Trailing incomplete links/images. We strip the markup back to its visible text
// (or remove an incomplete image) so nothing flashes as a broken link while the
// destination is still arriving.
const repairLink = (text: string): string => {
  // ![alt](url  — incomplete image destination
  let next = text.replace(/!\[[^\]]*\]\([^)]*$/, "");
  if (next !== text) {
    return next;
  }
  // ![alt  — incomplete image
  next = text.replace(/!\[[^\]]*$/, "");
  if (next !== text) {
    return next;
  }
  // [label](url  — incomplete link destination: keep just the label
  next = text.replace(/\[([^\]]*)\]\([^)]*$/, (_, label: string) => label);
  if (next !== text) {
    return next;
  }
  // [label  — incomplete link: drop the opening bracket, keep the label
  next = text.replace(/\[([^\]]*)$/, (_, label: string) => label);
  return next;
};

const countDelimiter = (
  masked: string,
  delimiter: string,
  guard?: (masked: string, index: number) => boolean,
): number => {
  let count = 0;
  let i = 0;
  while (i <= masked.length - delimiter.length) {
    if (masked.startsWith(delimiter, i)) {
      if (!isEscaped(masked, i) && (!guard || guard(masked, i))) {
        count++;
      }
      i += delimiter.length;
    } else {
      i++;
    }
  }
  return count;
};

const isWordChar = (ch: string | undefined): boolean => !!ch && /\w/.test(ch);

// `_` is only emphasis at a word boundary; `foo_bar_baz` underscores are literal.
const underscoreGuard = (masked: string, index: number): boolean => {
  const before = masked[index - 1];
  const after = masked[index + 1];
  return !(isWordChar(before) && isWordChar(after));
};

// A lone `*` flanked by spaces (or at line start) is a bullet/stray char, not
// italic.
const singleAsteriskGuard = (masked: string, index: number): boolean => {
  const before = masked[index - 1];
  const after = masked[index + 1];
  const flankedBySpace =
    (before === undefined || /\s/.test(before)) &&
    (after === undefined || /\s/.test(after));
  return !flankedBySpace;
};

const repairEmphasis = (text: string): string => {
  let out = text;

  // Close the longest markers first; counting each on a freshly-masked copy so
  // inline code and link urls never contribute.
  if (countDelimiter(maskForCounting(out), "**") % 2 === 1) {
    out = `${out}**`;
  }
  if (countDelimiter(maskForCounting(out), "__") % 2 === 1) {
    out = `${out}__`;
  }
  if (countDelimiter(maskForCounting(out), "~~") % 2 === 1) {
    out = `${out}~~`;
  }

  // Italic: mask the double markers to spaces so the single-char pass can't
  // mistake a `**`/`__` for two italics.
  const singleMasked = maskForCounting(out)
    .replaceAll("**", "  ")
    .replaceAll("__", "  ");
  if (countDelimiter(singleMasked, "*", singleAsteriskGuard) % 2 === 1) {
    out = `${out}*`;
  }
  if (countDelimiter(singleMasked, "_", underscoreGuard) % 2 === 1) {
    out = `${out}_`;
  }

  return out;
};

export const repairMarkdown = (text: string): string => {
  if (!text) {
    return text;
  }
  if (hasOpenFence(text)) {
    return text;
  }

  let out = repairInlineCode(text);
  out = repairLink(out);
  out = repairEmphasis(out);
  return out;
};
