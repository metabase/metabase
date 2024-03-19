import { useCallback } from "react";
import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";
import { getEngineNativeType } from "metabase/lib/engine";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { SqlButton, SqlIcon } from "./ConvertQueryButton.styled";

const BUTTON_TOOLTIP = {
  sql: t`View the SQL`,
  json: t`View the native query`,
};

interface ConvertQueryButtonProps {
  question: Question;
}

export const ConvertQueryButton = ({
  question,
}: ConvertQueryButtonProps): JSX.Element => {
  const engineType = getEngineNativeType(question.database()?.engine);
  const tooltip = BUTTON_TOOLTIP[engineType];

  const handleClick = useCallback(() => {}, []);

  return (
    <Tooltip tooltip={tooltip} placement="top">
      <SqlButton onClick={handleClick} aria-label={tooltip}>
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
  const { isNative } = Lib.queryDisplayInfo(question.query());
  return (
    !isNative &&
    question.database()?.native_permissions === "write" &&
    queryBuilderMode === "notebook"
  );
};
