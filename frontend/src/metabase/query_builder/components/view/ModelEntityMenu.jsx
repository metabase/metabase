/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import EntityMenu from "metabase/components/EntityMenu";

import cx from "classnames";

export default function ModelEntityMenu({
  className,
  question,
  onOpenModal,
  makeModelASavedQuestion,
}) {
  const canWrite = question && question.canWrite();
  return (
    <EntityMenu
      triggerIcon="pencil"
      className={cx("text-light", className)}
      items={[
        canWrite && {
          icon: "",
          title: t`Make model a saved question`,
          action: () => makeModelASavedQuestion(question),
        },
        canWrite && {
          icon: "move",
          title: t`Move`,
          action: () => onOpenModal("move"),
        },
      ]}
    />
  );
}
