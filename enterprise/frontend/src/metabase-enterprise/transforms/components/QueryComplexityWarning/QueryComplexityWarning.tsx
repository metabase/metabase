import cx from "classnames";
import { t } from "ttag";

import { Stack, Text } from "metabase/ui";
import { CHECKPOINT_TEMPLATE_TAG } from "metabase-enterprise/transforms/constants";

import S from "./QueryComplexityWarning.module.css";

type QueryComplexityWarningProps = {
  variant?: "default" | "standout";
};

export const QueryComplexityWarning = ({
  variant = "default",
}: QueryComplexityWarningProps) => {
  return (
    <Stack
      gap={variant === "standout" ? "sm" : "md"}
      className={cx({ [S.bordered]: variant === "standout" })}
      data-testid="query-complexity-warning"
    >
      {variant === "standout" && (
        <Text fw="bold">{t`We couldn’t add the check automatically.`}</Text>
      )}
      <Text lh="1.25rem">{t`This query is too complicated for us to automatically add a checkpoint. You can turn off incremental transformation, or add an explicit filter to the query, like this:`}</Text>
      <Text
        lh="1.25rem"
        py="md"
        className={cx({ [S.bordered]: variant === "default" })}
      >
        <code>{`[[ WHERE id > {{${CHECKPOINT_TEMPLATE_TAG}}} ]]`}</code>
      </Text>
      <Text
        lh="1.25rem"
        c="saturated-red"
      >{t`If you save anyway, this transform will likely not process new data, or might only process  partial quantities of new data.`}</Text>
    </Stack>
  );
};
