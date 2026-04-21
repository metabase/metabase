import {
  InputRule,
  PasteRule,
  markInputRule,
  markPasteRule,
} from "@tiptap/core";
import { Link } from "@tiptap/extension-link";
import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { processUrl } from "metabase/documents/utils/processUrl";

import S from "./PlainLink.module.css";

// Adapted from https://github.com/ueberdosis/tiptap/discussions/1865#discussioncomment-2568739

/**
 * The input regex for Markdown links with title support, and multiple quotation marks (required
 * in case the `Typography` extension is being included).
 *
 * @see https://stephenweiss.dev/regex-markdown-link
 */
const inputRegex =
  /(?:^|\s)\[([^\]]*)?\]\(([A-Za-z0-9:/. ]+)(?:["“](.+)["”])?\)$/;

/**
 * The paste regex for Markdown links with title support, and multiple quotation marks (required
 * in case the `Typography` extension is being included).
 *
 * @see https://stephenweiss.dev/regex-markdown-link
 */
const pasteRegex =
  /(?:^|\s)\[([^\]]*)?\]\(([A-Za-z0-9:/. ]+)(?:["“](.+)["”])?\)/g;

/**
 * Input rule built specifically for the `Link` extension, which ignores the auto-linked URL in
 * parentheses (e.g., `(https://doist.dev)`).
 *
 * @see https://github.com/ueberdosis/tiptap/discussions/1865
 */
function linkInputRule(config: Parameters<typeof markInputRule>[0]) {
  const defaultMarkInputRule = markInputRule(config);

  return new InputRule({
    find: config.find,
    handler: (props) => {
      const { tr } = props.state;

      defaultMarkInputRule.handler(props);
      tr.setMeta("preventAutolink", true);
    },
  });
}

/**
 * Paste rule built specifically for the `Link` extension, which ignores the auto-linked URL in
 * parentheses (e.g., `(https://doist.dev)`).
 *
 * @see https://github.com/ueberdosis/tiptap/discussions/1865
 */
function linkPasteRule(config: Parameters<typeof markPasteRule>[0]) {
  const defaultMarkInputRule = markPasteRule(config);

  return new PasteRule({
    find: config.find,
    handler: (props) => {
      const { tr } = props.state;

      defaultMarkInputRule.handler(props);
      tr.setMeta("preventAutolink", true);
    },
  });
}

/**
 * Custom extension that extends the built-in `Link` extension to add additional input and paste
 * rules for converting the Markdown link syntax [Doist](https://doist.com) into links. This
 * extension also adds support for the `title` attribute.
 */
export const PlainLink = Link.extend({
  // Typing after a link (e.g. hitting space) should not be linked - https://github.com/ueberdosis/tiptap/issues/2571#issuecomment-1712057913
  inclusive: false,
}).extend({
  addOptions() {
    const base = this.parent?.();
    return {
      ...base,
      HTMLAttributes: {
        ...base?.HTMLAttributes,
        class: cx(CS.link, S.plainLink, base?.HTMLAttributes?.class),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "a[href]:not([data-type='smart-link'])",
        getAttrs: (element) => {
          if (typeof element === "string") {
            return false;
          }
          // Don't parse smart-link elements as plain links
          if (element.getAttribute("data-type") === "smart-link") {
            return false;
          }
          return null;
        },
      },
    ];
  },

  addInputRules() {
    return [
      linkInputRule({
        find: inputRegex,
        type: this.type,

        // We need to use `pop()` to remove the last capture groups from the match to
        // satisfy Tiptap's `markPasteRule` expectation of having the content as the last
        // capture group in the match (this makes the attribute order important)
        getAttributes(match) {
          return {
            title: match.pop()?.trim(),
            href: processUrl(match.pop()?.trim() ?? ""),
          };
        },
      }),
    ];
  },
  addPasteRules() {
    return [
      linkPasteRule({
        find: pasteRegex,
        type: this.type,

        // We need to use `pop()` to remove the last capture groups from the match to
        // satisfy Tiptap's `markInputRule` expectation of having the content as the last
        // capture group in the match (this makes the attribute order important)
        getAttributes(match) {
          return {
            title: match.pop()?.trim(),
            href: processUrl(match.pop()?.trim() ?? ""),
          };
        },
      }),
    ];
  },
});
