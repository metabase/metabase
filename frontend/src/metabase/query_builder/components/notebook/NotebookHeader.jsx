import React from "react";

import { t } from "ttag";

import Button from "metabase/components/Button";
import { Flex } from "grid-styled";

const NotebookHeader = ({
  className,
  isRunnable,
  isDirty,
  isResultDirty,
  runQuestionQuery,
  onSetQueryBuilderMode,
  onOpenModal,
  setUIControls,
}) => (
  <Flex p={2} align="center" justify="flex-end" className={className}>
    {!isDirty && (
      <Button
        medium
        ml={1}
        onClick={() => onSetQueryBuilderMode("view")}
      >{t`Done`}</Button>
    )}
    {isDirty && (
      <Button
        medium
        ml={1}
        onClick={() => onOpenModal("save")}
      >{t`Save`}</Button>
    )}
  </Flex>
);

export default NotebookHeader;
