import React from "react";

import EntityMenu from "metabase/components/EntityMenu";

import cx from "classnames";

const QuestionEntityMenu = ({ className, onOpenModal }) => (
  <EntityMenu
    triggerIcon="pencil"
    className={cx("text-light", className)}
    items={[
      {
        icon: "editdocument",
        title: `Edit this question`,
        action: () => onOpenModal("edit"),
      },
      {
        icon: "history",
        title: `View revision history`,
        action: () => onOpenModal("history"),
      },
      { icon: "move", title: `Move`, action: () => onOpenModal("move") },
      {
        icon: "archive",
        title: `Archive`,
        action: () => onOpenModal("archive"),
      },
    ]}
  />
);

export default QuestionEntityMenu;
