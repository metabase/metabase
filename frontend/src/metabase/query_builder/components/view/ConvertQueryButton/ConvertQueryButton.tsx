import React, { useCallback } from "react";
import { t } from "ttag";
import { getEngineNativeType } from "metabase/lib/engine";
import Tooltip from "metabase/components/Tooltip";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import Question from "metabase-lib/Question";
import { SqlButton, SqlIcon } from "./ConvertQueryButton.styled";

const ENGINE_TOOLTIP = {
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
  const engine = question.database()?.engine;
  const engineType = getEngineNativeType(engine);

  const handleClick = useCallback(() => {
    onOpenModal?.(MODAL_TYPES.CONVERT_QUERY);
  }, [onOpenModal]);

  return (
    <Tooltip tooltip={ENGINE_TOOLTIP[engineType]}>
      <SqlButton
        onClick={handleClick}
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

export default ConvertQueryButton;
