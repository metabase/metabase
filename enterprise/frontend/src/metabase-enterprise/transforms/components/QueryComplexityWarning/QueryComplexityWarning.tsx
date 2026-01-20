import cx from "classnames";
import { c, t } from "ttag";

import { uncapitalize } from "metabase/lib/formatting/strings";
import { Stack, Text } from "metabase/ui";
import { CHECKPOINT_TEMPLATE_TAG } from "metabase-enterprise/transforms/constants";
import type { QueryComplexity } from "metabase-types/api";

import S from "./QueryComplexityWarning.module.css";

type QueryComplexityWarningProps = {
  variant?: "default" | "standout";
  complexity: QueryComplexity;
};

export const QueryComplexityWarning = ({
  variant = "default",
  complexity,
}: QueryComplexityWarningProps) => {
  const renderParagraph = () => {
    const reason = uncapitalize(complexity.reason);
    return c(
      "{0} is a reason phrase like 'contains a LIMIT', 'contains an OFFSET', 'contains a CTE', or 'is not a simple SELECT'",
    )
      .t`Because this query ${reason}, we can't automatically select a checkpoint column. You should either remove the LIMIT, turn off incremental transformation, or add an explicit conditional filter to the query, like this:`;
  };

  return (
    <Stack
      gap={variant === "standout" ? "sm" : "md"}
      className={cx({ [S.bordered]: variant === "standout" })}
      data-testid="query-complexity-warning"
    >
      {variant === "standout" && (
        <Text fw="bold">{t`We couldn’t add the check automatically.`}</Text>
      )}
      <Text lh="1.25rem">{renderParagraph()}</Text>
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
