import React from "react";

import { t } from "ttag";

import Button from "metabase/components/Button";
import QueryModeButton from "metabase/query_builder/components/QueryModeButton.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";
import { Flex } from "grid-styled";

const NotebookHeader = ({
  className,
  isRunnable,
  isDirty,
  isResultDirty,
  runQuestionQuery,
  setQueryBuilderMode,
  onOpenModal,
}) => (
  <Flex p={2} align="center" justify="flex-end" className={className}>
    <Tooltip tooltip={t`FIX ME`}>
      <QueryModeButton size={20} />
    </Tooltip>

    {isDirty && (
      <Button
        medium
        ml={3}
        onClick={() => onOpenModal("save")}
      >{t`Save`}</Button>
    )}
    <Button
      medium
      primary
      ml={1}
      onClick={() => setQueryBuilderMode("view")}
    >{t`Done`}</Button>
  </Flex>
);

export default NotebookHeader;
