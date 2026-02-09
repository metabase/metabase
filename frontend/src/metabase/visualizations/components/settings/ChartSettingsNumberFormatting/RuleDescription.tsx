import { match } from "ts-pattern";
import { jt, t } from "ttag";

import { Text } from "metabase/ui";

import { NUMBER_OPERATOR_NAMES } from "./get-operators";
import type { NumberFormattingSetting } from "./types";

export const RuleDescription = ({
  rule,
}: {
  rule: NumberFormattingSetting;
}) => {
  return (
    <Text component="span" lh="normal">
      {match(rule)
        .with(
          { type: "range" },
          () => t`The number will be tinted based on its value.`,
        )
        .with(
          { type: "single" },
          (singleRule) =>
            jt`When the number ${(
              <Text component="span" key="bold" fw="bold" lh="normal">
                {NUMBER_OPERATOR_NAMES[singleRule.operator]} {singleRule.value}
              </Text>
            )} it will be this color.`,
        )
        .otherwise(() => null)}
    </Text>
  );
};
