import { Text } from "metabase/ui";

type JsxTokenType = "punctuation" | "tag" | "attribute" | "value" | "plain";

interface JsxToken {
  type: JsxTokenType;
  value: string;
}

/**
 * A deliberately simple JSX tokenizer — enough to tell apart `<>/=`, the
 * component name, prop names and prop values. It is not a real parser; it
 * understands opening, self-closing and closing tags, plus plain text children
 * — e.g. `<Chip variant="light" />` and `<Kbd>⌘</Kbd>`.
 */
export function tokenizeJsx(code: string): JsxToken[] {
  const pattern =
    /("[^"]*"|'[^']*'|\{[^}]*\})|([<>/=])|([A-Za-z_][\w-]*)|(\s+)|([^\s])/g;
  const tokens: JsxToken[] = [];
  // Whether we're between `<` and `>` (inside a tag) vs. in element content,
  // and whether the next identifier is the tag name (right after `<` or `</`).
  let inTag = false;
  let expectTagName = false;

  for (const match of code.matchAll(pattern)) {
    const [value, string, punctuation, identifier] = match;

    if (string != null) {
      tokens.push({ type: "value", value });
    } else if (punctuation != null) {
      tokens.push({ type: "punctuation", value });
      if (value === "<") {
        inTag = true;
        expectTagName = true;
      } else if (value === ">") {
        inTag = false;
        expectTagName = false;
      } else if (value !== "/") {
        // `/` is left alone so `</Tag>` keeps expecting the tag name set by `<`.
        expectTagName = false;
      }
    } else if (identifier != null && inTag) {
      tokens.push({ type: expectTagName ? "tag" : "attribute", value });
      expectTagName = false;
    } else {
      // Whitespace, stray characters, and identifiers in element content.
      tokens.push({ type: "plain", value });
    }
  }

  return tokens;
}

const TOKEN_COLOR: Record<JsxTokenType, string> = {
  punctuation: "var(--mb-color-text-secondary)",
  tag: "var(--mb-color-text-primary)",
  attribute: "var(--mb-color-core-blue-saturated)",
  value: "var(--mb-color-core-green-saturated)",
  plain: "var(--mb-color-text-primary)",
};

interface StoryJsxProps {
  children: string;
}

/** Monospace JSX with light syntax highlighting (tags, props, values). */
export function StoryJsx({ children }: StoryJsxProps) {
  return (
    <Text ff="monospace" size="sm" fw={500}>
      {tokenizeJsx(children).map((token, index) => (
        <span
          key={`${index}-${token.value}`}
          style={{ color: TOKEN_COLOR[token.type] }}
        >
          {token.value}
        </span>
      ))}
    </Text>
  );
}
