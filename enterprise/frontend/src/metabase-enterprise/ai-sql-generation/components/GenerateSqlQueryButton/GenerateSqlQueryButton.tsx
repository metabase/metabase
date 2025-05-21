import { t } from "ttag";

import type { GenerateSqlQueryButtonProps } from "metabase/plugins";
import { Button, Icon, Tooltip } from "metabase/ui";
import { useGenerateSqlQueryMutation } from "metabase-enterprise/api";

export function GenerateSqlQueryButton({
  className,
  prompt,
  databaseId,
  onGenerateQuery,
}: GenerateSqlQueryButtonProps) {
  const isEmpty = prompt.trim().length === 0;
  const [generateSql, { isLoading }] = useGenerateSqlQueryMutation();

  const handleClick = async () => {
    const { data } = await generateSql({ prompt, database_id: databaseId });
    if (data) {
      onGenerateQuery(data.generated_sql);
    }
  };

  return (
    <Tooltip label={t`Generate SQL based on the prompt selected in the editor`}>
      <Button
        className={className}
        variant="subtle"
        leftSection={<Icon name="metabot" />}
        loading={isLoading}
        disabled={isEmpty}
        onClick={handleClick}
      />
    </Tooltip>
  );
}
