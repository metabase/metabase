import { useEffect, useState } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils/errors";
import { Markdown } from "metabase/common/components/Markdown";
/* eslint-disable boundaries/element-types -- reuse the Metabot indicator until this is past the prototype */
import { MetabotWorkingIndicator } from "metabase/metabot/components/MetabotWorkingIndicator";
/* eslint-enable boundaries/element-types */
import { formatIdentifier } from "metabase/querying/expressions";
import { Box, Button, Flex, Icon, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import { useExplainExpressionMutation } from "../GenerateExpressionPrompt/api";

import S from "./ExplainExpression.module.css";

type ExplainExpressionProps = {
  query: Lib.Query;
  stageIndex: number;
  expressionMode: Lib.ExpressionMode;
  availableColumns: Lib.ColumnMetadata[];
  name?: string;
  source: string;
  onClose: () => void;
};

/** An explanation of the expression in plain words, from the AI. */
export function ExplainExpression({
  query,
  stageIndex,
  expressionMode,
  availableColumns,
  name,
  source,
  onClose,
}: ExplainExpressionProps) {
  const [explainExpression] = useExplainExpressionMutation();
  const [explanation, setExplanation] = useState<{
    summary: string;
    details?: string;
  }>();
  const [isShowingDetails, setIsShowingDetails] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const columns = availableColumns.map((column) =>
      formatIdentifier(
        Lib.displayInfo(query, stageIndex, column).longDisplayName,
      ),
    );
    const request = explainExpression({
      source,
      expression_mode: expressionMode,
      columns,
      name,
    });
    request.unwrap().then(
      (response) => setExplanation(response),
      (error) => {
        if (error?.name !== "AbortError") {
          setError(getErrorMessage(error));
        }
      },
    );
    return () => request.abort();
    // Explain the expression as it was when the panel opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box className={S.container} data-testid="explain-expression">
      <Flex align="center" gap="sm" mb="sm">
        <Icon name="info" c="text-secondary" />
        <Text fw="bold">{t`What this expression does`}</Text>
      </Flex>
      {explanation != null ? (
        <Box className={S.explanation}>
          <Markdown>{explanation.summary}</Markdown>
          {explanation.details != null &&
            (isShowingDetails ? (
              <Markdown className={S.details}>{explanation.details}</Markdown>
            ) : (
              <Button
                variant="subtle"
                size="compact-sm"
                p={0}
                mt="xs"
                fw="normal"
                onClick={() => setIsShowingDetails(true)}
              >
                {t`More details`}
              </Button>
            ))}
        </Box>
      ) : error != null ? (
        <Text c="feedback-negative">{error}</Text>
      ) : (
        <MetabotWorkingIndicator fz="sm" />
      )}
      <Flex justify="end" mt="sm">
        <Button variant="subtle" fw="normal" onClick={onClose}>
          {t`Close`}
        </Button>
      </Flex>
    </Box>
  );
}
