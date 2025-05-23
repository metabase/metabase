import { t } from "ttag";

import type { GenerateSqlQueryButtonProps } from "metabase/plugins";
import { Button, Icon, Tooltip } from "metabase/ui";
import { useLazyGenerateSqlQueryQuery } from "metabase-enterprise/api";
import * as Lib from "metabase-lib";

export function GenerateSqlQueryButton({
  className,
  query,
  selectedQueryText,
  onGenerateQuery,
}: GenerateSqlQueryButtonProps) {
  const [generateSql, { isLoading }] = useLazyGenerateSqlQueryQuery();
  const promptInfo = getPromptInfo(query, selectedQueryText);

  const handleClick = async () => {
    if (promptInfo == null) {
      return;
    }
    const { data } = await generateSql({
      prompt: promptInfo.prompt,
      database_id: promptInfo.databaseId,
    });
    if (data == null) {
      return;
    }
    onGenerateQuery(getQueryText(promptInfo.prompt, data.generated_sql));
  };

  return (
    <Tooltip
      label={
        promptInfo?.isSelected
          ? t`Generate SQL based on the prompt selected in the editor`
          : t`Generate SQL based on the prompt`
      }
    >
      <Button
        className={className}
        variant="subtle"
        leftSection={<Icon name="metabot" />}
        loading={isLoading}
        disabled={promptInfo == null}
        aria-label={t`Generate SQL based on the prompt`}
        onClick={handleClick}
      />
    </Tooltip>
  );
}

const COMMENT_PREFIX = "--";

function getPromptInfo(
  query: Lib.Query,
  selectedQueryText: string | undefined,
) {
  const databaseId = Lib.databaseID(query);
  const queryInfo = Lib.queryDisplayInfo(query);
  if (!queryInfo.isNative || databaseId == null) {
    return;
  }

  const selectedText = selectedQueryText?.trim();
  if (selectedText != null && selectedText.length > 0) {
    return {
      prompt: selectedText,
      databaseId: databaseId,
      isSelected: true,
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
      databaseId: databaseId,
      isSelected: false,
    };
  }
}

function getQueryText(prompt: string, generatedSql: string) {
  const singleLinePrompt = prompt.replaceAll("\n", " ");
  return `${COMMENT_PREFIX} ${singleLinePrompt}\n${generatedSql}`;
}
