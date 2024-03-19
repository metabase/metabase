import { useCallback } from "react";
import { t } from "ttag";

import { getEngineNativeType } from "metabase/lib/engine";
import { Icon, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { SqlButton } from "./ConvertQueryButton.styled";

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
    <Tooltip label={tooltip} position="top">
      <SqlButton onClick={handleClick} aria-label={tooltip}>
        <Icon size="1rem" name="sql" />
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
