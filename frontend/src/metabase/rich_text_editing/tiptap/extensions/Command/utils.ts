import { t } from "ttag";

import type { EditorCapabilities } from "metabase/rich_text_editing/tiptap/EditorHost";

import type { CommandSection } from "./types";

export const getAllCommandSections = (
  isMetabotEnabled: boolean,
  metabotName: string = "Metabot",
  capabilities: EditorCapabilities,
): CommandSection[] => {
  return [
    {
      items: [
        ...(isMetabotEnabled && capabilities.canUseMetabot
          ? ([
              {
                icon: "metabot" as const,
                label: t`Ask ${metabotName}`,
                command: "metabot",
                isAllowedAtPosition: (editor) =>
                  !editor.isActive("supportingText"),
              },
            ] satisfies CommandSection["items"])
          : []),
        ...(capabilities.canEmbedCharts
          ? ([
              {
                icon: "lineandbar",
                label: t`Chart`,
                command: "embedQuestion",
                isAllowedAtPosition: (editor) =>
                  !editor.isActive("supportingText"),
              },
            ] satisfies CommandSection["items"])
          : []),
        {
          icon: "link",
          label: t`Link`,
          command: "linkTo",
        },
      ],
    },
    {
      title: t`Formatting`,
      items: [
        {
          text: "H1",
          label: t`Heading 1`,
          command: "heading1",
        },
        {
          text: "H2",
          label: t`Heading 2`,
          command: "heading2",
        },
        {
          text: "H3",
          label: t`Heading 3`,
          command: "heading3",
        },
        {
          icon: "list",
          label: t`Bullet list`,
          command: "bulletList",
        },
        {
          icon: "ordered_list",
          label: t`Numbered list`,
          command: "orderedList",
        },
        {
          icon: "quote",
          label: t`Quote`,
          command: "blockquote",
        },
        {
          icon: "code_block",
          label: t`Code block`,
          command: "codeBlock",
        },
      ],
    },
  ];
};
