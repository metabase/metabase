import { t } from "ttag";

import { PLUGIN_METABOT } from "metabase/plugins";

import type { CommandSection } from "./types";

export const getAllCommandSections = (): CommandSection[] => {
  return [
    {
      items: [
        ...(PLUGIN_METABOT.isEnabled()
          ? ([
              {
                icon: "metabot",
                label: t`Ask Metabot`,
                command: "metabot",
              },
            ] as const)
          : []),
        {
          icon: "lineandbar",
          label: t`Chart`,
          command: "embedQuestion",
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
