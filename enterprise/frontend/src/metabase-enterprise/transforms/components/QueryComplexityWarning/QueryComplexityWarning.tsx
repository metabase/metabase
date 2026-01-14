import type { MantineStyleProps } from "@mantine/core/lib/core/Box/style-props/style-props.types";
import { t } from "ttag";

import { uncapitalize } from "metabase/lib/formatting/strings";
import { Stack, Text } from "metabase/ui";
import { CHECKPOINT_TEMPLATE_TAG } from "metabase-enterprise/transforms/constants";
import type { QueryComplexity } from "metabase-types/api";

type QueryComplexityWarningProps = {
  variant?: "default" | "standout";
  complexity: QueryComplexity;
};

export const QueryComplexityWarning = ({
  variant = "default",
  complexity,
}: QueryComplexityWarningProps) => {
  const renderParagraph = () => {
    const pre = t`Because this query `;
    const post = t`, we can’t automatically select a checkpoint column. You should either remove the LIMIT, turn off incremental transformation, or add an explicit conditional filter to the query, like this:`;
    return `${pre}${uncapitalize(complexity.reason)}${post}`;
  };

  const borderedStyle: MantineStyleProps = {
    bg: "background-secondary",
    p: "md",
    bd: "1px solid var(--mb-color-border)",
    bdrs: "md",
  };

  let stackStyleProps: MantineStyleProps = {};
  let codeStyleProps: MantineStyleProps = {};
  if (variant === "standout") {
    stackStyleProps = borderedStyle;
  } else {
    codeStyleProps = borderedStyle;
  }

  return (
    <Stack
      gap={variant === "standout" ? "sm" : "md"}
      {...stackStyleProps}
      data-testid="query-complexity-warning"
    >
      {variant === "standout" && (
        <Text fw="bold">{t`We couldn’t add the check automatically.`}</Text>
      )}
      <Text lh="1.25rem">{renderParagraph()}</Text>
      <Text lh="1.25rem" py="md" {...codeStyleProps}>
        <code>{`[[ WHERE id > {{${CHECKPOINT_TEMPLATE_TAG}}} ]]`}</code>
      </Text>
      <Text
        lh="1.25rem"
        c="saturated-red"
      >{t`If you save anyway, this transform will likely not process new data, or might only process  partial quantities of new data.`}</Text>
    </Stack>
  );
};
