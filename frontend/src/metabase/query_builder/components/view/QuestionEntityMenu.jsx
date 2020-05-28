import React from "react";
import { t } from "ttag";

import EntityMenu from "metabase/components/EntityMenu";

import cx from "classnames";

export default function QuestionEntityMenu({
  className,
  question,
  onOpenModal,
}) {
  const canWrite = question && question.canWrite();
  return (
    <EntityMenu
      triggerIcon="pencil"
      className={cx("text-light", className)}
      items={[
        canWrite && {
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
        canWrite && {
          icon: "move",
          title: t`Move`,
          action: () => onOpenModal("move"),
        },
        canWrite && {
          icon: "archive",
          title: `Archive`,
          action: () => onOpenModal("archive"),
        },
      ]}
    />
  );
}
