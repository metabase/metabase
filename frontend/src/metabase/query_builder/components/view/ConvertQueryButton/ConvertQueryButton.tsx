import React, { useCallback } from "react";
import { t } from "ttag";
import { getEngineNativeType } from "metabase/lib/engine";
import Tooltip from "metabase/core/components/Tooltip";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import Question from "metabase-lib/Question";
import { SqlButton, SqlIcon } from "./ConvertQueryButton.styled";

const BUTTON_TOOLTIP = {
  sql: t`View the SQL`,
  json: t`View the native query`,
};

interface ConvertQueryButtonProps {
  question: Question;
  onOpenModal?: (modalType: string) => void;
}

const ConvertQueryButton = ({
  question,
  onOpenModal,
}: ConvertQueryButtonProps): JSX.Element => {
  const engineType = getEngineNativeType(question.database()?.engine);
  const tooltip = BUTTON_TOOLTIP[engineType];

  const handleClick = useCallback(() => {
    onOpenModal?.(MODAL_TYPES.CONVERT_QUERY);
  }, [onOpenModal]);

  return (
    <Tooltip tooltip={tooltip} placement="top">
      <SqlButton
        onClick={handleClick}
        aria-label={tooltip}
        data-metabase-event="Notebook Mode; Convert to SQL Click"
      >
        <SqlIcon name="sql" />
      </SqlButton>
    </Tooltip>
  );
};

interface ConvertQueryButtonOpts {
  question: Question;
  queryBuilderMode: string;
}

ConvertQueryButton.shouldRender = ({
  question,
  queryBuilderMode,
}: ConvertQueryButtonOpts) => {
  return (
    question.isStructured() &&
    question.database()?.native_permissions === "write" &&
    queryBuilderMode === "notebook"
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ConvertQueryButton;
