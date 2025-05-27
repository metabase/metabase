import { match } from "ts-pattern";
import { jt, t } from "ttag";

import { Text } from "metabase/ui";
import type {
  ColumnFormattingSetting,
  ColumnSingleFormattingSetting,
} from "metabase-types/api";

import { ALL_OPERATOR_NAMES } from "./get-operators-for-columns";

export const getValueForDescription = (rule: ColumnSingleFormattingSetting) =>
  ["is-null", "not-null"].includes(rule.operator) ? "" : ` ${rule.value}`;

export const RuleDescription = ({
  rule,
}: {
  rule: ColumnFormattingSetting;
}) => {
  return (
    <Text component="span" lh="normal">
      {match(rule)
        .with(
          { type: "range" },
          () => t`Cells in this column will be tinted based on their values.`,
        )
        .with(
          { type: "single" },
          (singleRule) =>
            jt`When a cell in these columns ${(
              <Text component="span" key="bold" fw="bold" lh="normal">
                {ALL_OPERATOR_NAMES[singleRule.operator]}
                {getValueForDescription(singleRule)}
              </Text>
            )} it will be tinted this color.`,
        )
        .otherwise(() => null)}
    </Text>
  );
};
