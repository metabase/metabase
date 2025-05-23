import { t } from "ttag";

import type { GenerateSqlQueryButtonProps } from "metabase/plugins";
import { Button, Icon, Tooltip } from "metabase/ui";
import { useLazyGenerateSqlQueryQuery } from "metabase-enterprise/api";
import * as Lib from "metabase-lib";
import type { GenerateSqlQueryRequest } from "metabase-types/api";

export function GenerateSqlQueryButton({
  className,
  query,
  selectedQueryText,
  onGenerateQuery,
}: GenerateSqlQueryButtonProps) {
  const [generateSql, { isLoading }] = useLazyGenerateSqlQueryQuery();
  const request = getRequest(query, selectedQueryText);

  const handleClick = async () => {
    if (request == null) {
      return;
    }
    const { data } = await generateSql(request);
    if (data == null) {
      return;
    }
    onGenerateQuery(getQueryText(request.prompt, data.generated_sql));
  };

  return (
    <Tooltip label={t`Generate SQL based on the prompt selected in the editor`}>
      <Button
        className={className}
        variant="subtle"
        leftSection={<Icon name="metabot" />}
        loading={isLoading}
        disabled={request == null}
        aria-label={t`Generate SQL based on the prompt`}
        onClick={handleClick}
      />
    </Tooltip>
  );
}

const COMMENT_PREFIX = "--";

function getRequest(
  query: Lib.Query,
  selectedQueryText: string | undefined,
): GenerateSqlQueryRequest | undefined {
  const databaseId = Lib.databaseID(query);
  const queryInfo = Lib.queryDisplayInfo(query);
  if (!queryInfo.isNative || databaseId == null) {
    return;
  }

  const selectedText = selectedQueryText?.trim();
  if (selectedText != null && selectedText.length > 0) {
    return {
      prompt: selectedText,
      database_id: databaseId,
    };
  }

  const commentText = Lib.rawNativeQuery(query)
    .split("\n")
    .find((line) => line.startsWith(COMMENT_PREFIX))
    ?.substring(COMMENT_PREFIX.length)
    ?.trim();
  if (commentText != null && commentText.length > 0) {
    return {
      prompt: commentText,
      database_id: databaseId,
    };
  }
}

function getQueryText(prompt: string, generatedSql: string) {
  const singleLinePrompt = prompt.replaceAll("\n", " ");
  return `${COMMENT_PREFIX} ${singleLinePrompt}\n${generatedSql}`;
}
