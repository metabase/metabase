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
  const [generateSql, { isFetching }] = useLazyGenerateSqlQueryQuery();
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
        loading={isFetching}
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

  const promptFromSelection = selectedQueryText?.trim();
  if (promptFromSelection != null && promptFromSelection.length > 0) {
    return {
      prompt: promptFromSelection,
      database_id: databaseId,
    };
  }

  const promptFromComment = Lib.rawNativeQuery(query)
    .split("\n")
    .find((line) => line.startsWith(COMMENT_PREFIX))
    ?.substring(COMMENT_PREFIX.length)
    ?.trim();
  if (promptFromComment != null && promptFromComment.length > 0) {
    return {
      prompt: promptFromComment,
      database_id: databaseId,
    };
  }
}

function getQueryText(prompt: string, generatedSql: string) {
  const singleLinePrompt = prompt.replaceAll("\n", " ");
  return `${COMMENT_PREFIX} ${singleLinePrompt}\n${generatedSql}`;
}
