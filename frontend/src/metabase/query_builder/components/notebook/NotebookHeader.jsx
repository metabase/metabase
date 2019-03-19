import React from "react";

import { t } from "c-3po";

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
}) => (
  <Flex p={2} align="center" justify="flex-end" className={className}>
    {isRunnable && (
      <Button
        medium
        primary
        ml={1}
        onClick={() => {
          if (isResultDirty) {
            runQuestionQuery();
          }
          onSetQueryBuilderMode("view");
        }}
      >{t`Visualize`}</Button>
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
