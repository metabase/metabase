import React from "react";

import EntityMenu from "metabase/components/EntityMenu";
import { t } from "c-3po";
export const component = EntityMenu;

export const description = `
    A menu with varios entity related options grouped by context.
`;

const DemoAlignRight = ({ children }) => (
  <div className="flex flex-full">
    <div className="flex align-center ml-auto">{children}</div>
  </div>
);

export const examples = {
  "Edit menu": (
    <DemoAlignRight>
      <EntityMenu
        triggerIcon="pencil"
        items={[
          {
            title: t`Edit this question`,
            icon: "editdocument",
            action: () => alert(t`Action type`),
          },
          { title: t`View revision history`, icon: "history", link: "/derp" },
          { title: t`Move`, icon: "move", action: () => alert(t`Move action`) },
          {
            title: t`Archive`,
            icon: "archive",
            action: () => alert(t`Archive action`),
          },
        ]}
      />
    </DemoAlignRight>
  ),
  "Share menu": (
    <DemoAlignRight>
      <EntityMenu
        triggerIcon="share"
        items={[
          {
            title: t`Add to dashboard`,
            icon: "addtodash",
            action: () => alert(t`Action type`),
          },
          { title: t`Download results`, icon: "download", link: "/download" },
          {
            title: t`Sharing and embedding`,
            icon: "embed",
            action: () => alert(t`Another action type`),
          },
        ]}
      />
    </DemoAlignRight>
  ),
  "More menu": (
    <DemoAlignRight>
      <EntityMenu
        triggerIcon="burger"
        items={[
          {
            title: t`Get alerts about this`,
            icon: "alert",
            action: () => alert(t`Get alerts about this`),
          },
          { title: t`View the SQL`, icon: "sql", link: "/download" },
        ]}
      />
    </DemoAlignRight>
  ),
  "Multiple menus": (
    <DemoAlignRight>
      <EntityMenu
        triggerIcon="pencil"
        items={[
          {
            title: t`Edit this question`,
            icon: "editdocument",
            action: () => alert(t`Action type`),
          },
          { title: t`View revision history`, icon: "history", link: "/derp" },
          { title: t`Move`, icon: "move", action: () => alert(t`Move action`) },
          {
            title: t`Archive`,
            icon: "archive",
            action: () => alert(t`Archive action`),
          },
        ]}
      />
      <EntityMenu
        triggerIcon="share"
        items={[
          {
            title: t`Add to dashboard`,
            icon: "addtodash",
            action: () => alert(t`Action type`),
          },
          { title: t`Download results`, icon: "download", link: "/download" },
          {
            title: t`Sharing and embedding`,
            icon: "embed",
            action: () => alert(t`Another action type`),
          },
        ]}
      />
      <EntityMenu
        triggerIcon="burger"
        items={[
          {
            title: t`Get alerts about this`,
            icon: "alert",
            action: () => alert(t`Get alerts about this`),
          },
          { title: t`View the SQL`, icon: "sql", link: "/download" },
        ]}
      />
    </DemoAlignRight>
  ),
};
