import { jt, t } from "ttag";

import CS from "metabase/css/core/index.css";
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
    <span>
      {rule.type === "range"
        ? t`Cells in this column will be tinted based on their values.`
        : rule.type === "single"
          ? jt`When a cell in these columns ${(
              <span key="bold" className={CS.textBold}>
                {ALL_OPERATOR_NAMES[rule.operator]}
                {getValueForDescription(rule)}
              </span>
            )} it will be tinted this color.`
          : null}
    </span>
  );
};
