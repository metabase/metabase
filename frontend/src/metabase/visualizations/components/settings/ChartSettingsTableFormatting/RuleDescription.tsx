import { jt, t } from "ttag";

import CS from "metabase/css/core/index.css";
import type { ColumnFormattingSetting } from "metabase-types/api";

import { ALL_OPERATOR_NAMES } from "./constants";
import { getValueForDescription } from "./util";

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
