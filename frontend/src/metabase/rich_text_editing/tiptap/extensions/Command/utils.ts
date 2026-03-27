import { t } from "ttag";

import type { CommandSection } from "./types";

export const getAllCommandSections = (
  isMetabotEnabled: boolean,
): CommandSection[] => {
  return [
    {
      items: [
        ...(isMetabotEnabled
          ? ([
              {
                icon: "metabot" as const,
                label: t`Ask Metabot`,
                command: "metabot",
                isAllowedAtPosition: (editor) =>
                  !editor.isActive("supportingText"),
              },
            ] satisfies CommandSection["items"])
          : []),
        {
          icon: "lineandbar",
          label: t`Chart`,
          command: "embedQuestion",
          isAllowedAtPosition: (editor) => !editor.isActive("supportingText"),
        },
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
