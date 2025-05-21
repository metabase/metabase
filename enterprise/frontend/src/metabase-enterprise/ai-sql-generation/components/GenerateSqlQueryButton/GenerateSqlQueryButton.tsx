import { t } from "ttag";

import { getEngineNativeType } from "metabase/lib/engine";
import type { GenerateSqlQueryButtonProps } from "metabase/plugins";
import { Button, Icon, Tooltip } from "metabase/ui";
import { useGenerateSqlQueryMutation } from "metabase-enterprise/api";
import * as Lib from "metabase-lib";

export function GenerateSqlQueryButton({
  className,
  query,
  selectedQueryText,
  onGenerateQuery,
}: GenerateSqlQueryButtonProps) {
  const [generateSql, { isLoading }] = useGenerateSqlQueryMutation();
  const prompt = getPrompt(query, selectedQueryText);
  const databaseId = Lib.databaseID(query);
  const isEmpty = databaseId == null || prompt == null;
  const isVisible = canGenerateQuery(query);

  const handleClick = async () => {
    if (isEmpty) {
      return;
    }
    const { data } = await generateSql({ prompt, database_id: databaseId });
    if (data == null) {
      return;
    }
    onGenerateQuery(getQueryText(prompt, data.generated_sql));
  };

  if (!isVisible) {
    return null;
  }

  return (
    <Tooltip label={t`Generate SQL based on the prompt selected in the editor`}>
      <Button
        className={className}
        variant="subtle"
        leftSection={<Icon name="sparkles" />}
        loading={isLoading}
        disabled={isEmpty}
        onClick={handleClick}
      />
    </Tooltip>
  );
}

const COMMENT_PREFIX = "--";

function canGenerateQuery(query: Lib.Query) {
  const engine = Lib.engine(query);
  return engine != null && getEngineNativeType(engine) !== "sql";
}

function getPrompt(query: Lib.Query, selectedQueryText: string | null) {
  const prompt =
    selectedQueryText?.trim() ??
    Lib.rawNativeQuery(query)
      .split("\n")
      .find((line) => line.startsWith(COMMENT_PREFIX))
      ?.substring(COMMENT_PREFIX.length)
      ?.trim();
  return prompt != null && prompt.length > 0 ? prompt : null;
}

function getQueryText(prompt: string, generatedSql: string) {
  const singleLinePrompt = prompt.replaceAll("\n", " ");
  return `${COMMENT_PREFIX} ${singleLinePrompt}\n${generatedSql}`;
}
