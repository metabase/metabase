import { mergeAttributes } from "@tiptap/core";
import Mention, {
  type MentionNodeAttrs,
  type MentionOptions,
} from "@tiptap/extension-mention";
import cx from "classnames";

import S from "./mentions.module.css";

export interface CustomMentionAttributes extends MentionNodeAttrs {
  id: string | null;
  label: string;
  model: "user" | "card" | "dashboard" | "dataset" | "metric";
  mentionSuggestionChar?: string;
}

export const CustomMentionExtension = Mention.extend<
  MentionOptions,
  CustomMentionAttributes
>({
  name: "mention",

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-mention-id"),
        renderHTML: (attributes: CustomMentionAttributes) => ({
          "data-mention-id": attributes.id,
        }),
      },
      label: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-mention-label"),
        renderHTML: (attributes: CustomMentionAttributes) => ({
          "data-mention-label": attributes.label,
        }),
      },
      mentionSuggestionChar: {
        default: "@",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-mention-char") || "@",
        renderHTML: (attributes: CustomMentionAttributes) => ({
          "data-mention-char": attributes.mentionSuggestionChar,
        }),
      },

      model: {
        default: "user",
        renderHTML: (attributes: CustomMentionAttributes) => ({
          "data-mention-model": attributes.model,
        }),
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-mention-model") || "user",
      },
    };
  },

  renderHTML({
    node,
    HTMLAttributes,
  }: {
    node: any;
    HTMLAttributes: Record<string, any>;
  }) {
    const { id, model, label } = node.attrs as CustomMentionAttributes;

    const baseAttrs = {
      class: cx(S.mention, model !== "user" && S.mentionLink),
      "data-mention-id": id,
      "data-mention-model": model,
      // Prevent navigation on click in editor
      contenteditable: "false",
    };

    if (model === "user") {
      return ["span", mergeAttributes(baseAttrs, HTMLAttributes), `@${label}`];
    }

    let href = "#";
    switch (model) {
      case "card":
        href = `/question/${id}`;
        break;
      case "dashboard":
        href = `/dashboard/${id}`;
        break;
      case "dataset":
        href = `/model/${id}`;
        break;
      case "metric":
        href = `/metric/${id}`;
        break;
    }

    return [
      "a",
      mergeAttributes(
        {
          href,
          ...baseAttrs,
        },
        HTMLAttributes,
      ),
      label,
    ];
  },

  renderText({ node }: { node: any }) {
    const { label, id } = node.attrs as CustomMentionAttributes;
    return `@${label ?? id}`;
  },

  parseHTML() {
    return [
      {
        tag: "a[data-mention-id]",
        getAttrs: (element: string | HTMLElement) => {
          if (typeof element === "string") {
            return null;
          }
          const id = element.getAttribute("data-mention-id");
          const model = element.getAttribute("data-mention-model") || "user";
          const label = element.textContent?.replace(/^@/, "") || "";

          return {
            id,
            model,
            label,
          };
        },
      },
    ];
  },
});
