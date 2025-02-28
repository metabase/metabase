import cx from "classnames";
import type { MouseEventHandler } from "react";
import { t } from "ttag";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";
import type {
  ColumnFormattingSetting,
  DatasetColumn,
} from "metabase-types/api";

import { RuleBackground } from "./RuleBackground";
import { RuleDescription } from "./RuleDescription";

export const RulePreview = ({
  rule,
  cols,
  onClick,
  onRemove,
}: {
  rule: ColumnFormattingSetting;
  cols: DatasetColumn[];
  onClick: MouseEventHandler<HTMLDivElement>;
  onRemove: () => void;
}) => (
  <div
    className={cx(
      CS.my2,
      CS.bordered,
      CS.rounded,
      CS.shadowed,
      CS.cursorPointer,
      CS.bgWhite,
    )}
    onClick={onClick}
    data-testid="formatting-rule-preview"
  >
    <div className={cx(CS.p1, CS.borderBottom, CS.relative, CS.bgLight)}>
      <div className={cx(CS.px1, CS.flex, CS.alignCenter, CS.relative)}>
        <span className={cx(CS.h4, CS.flexAuto, CS.textDark, CS.textWrap)}>
          {rule.columns.length > 0 ? (
            rule.columns
              .map(
                name =>
                  (_.findWhere(cols, { name }) || {}).display_name || name,
              )
              .join(", ")
          ) : (
            <span
              style={{ fontStyle: "oblique" }}
            >{t`No columns selected`}</span>
          )}
        </span>
        <Icon
          name="close"
          className={cx(CS.cursorPointer, CS.textLight, CS.textMediumHover)}
          style={{ minWidth: 16 }}
          onClick={e => {
            e.stopPropagation();
            onRemove();
          }}
        />
      </div>
    </div>
    <div className={cx(CS.p2, CS.flex, CS.alignCenter)}>
      <RuleBackground
        rule={rule}
        className={cx(CS.mr2, CS.flexNoShrink, CS.rounded, {
          [CS.bordered]: rule.type === "range",
        })}
        style={{ width: 40, height: 40 }}
      />
      <RuleDescription rule={rule} />
    </div>
  </div>
);
