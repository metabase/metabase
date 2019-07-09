import React from "react";
import { t } from "ttag";

import EntityMenu from "metabase/components/EntityMenu";

import cx from "classnames";

const QuestionEntityMenu = ({ className, onOpenModal }) => (
  <EntityMenu
    triggerIcon="pencil"
    className={cx("text-light", className)}
    items={[
      {
        icon: "edit_document",
        title: t`Edit this question`,
        action: () => onOpenModal("edit"),
      },
      {
        icon: "history",
        title: t`View revision history`,
        action: () => onOpenModal("history"),
      },
      {
        icon: "add_to_dash",
        title: t`Add to dashboard`,
        action: () => onOpenModal("add-to-dashboard"),
      },
      {
        icon: "move",
        title: t`Move`,
        action: () => onOpenModal("move"),
      },
      {
        icon: "archive",
        title: `Archive`,
        action: () => onOpenModal("archive"),
      },
    ]}
  />
);

export default QuestionEntityMenu;
