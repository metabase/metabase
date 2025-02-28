import type { MouseEventHandler } from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import CS from "metabase/css/core/index.css";

import {
  SortableRuleList,
  type SortableRuleListProps,
} from "./SortableRuleList";

export const RuleListing = ({
  rules,
  cols,
  onEdit,
  onAdd,
  onRemove,
  onMove,
}: SortableRuleListProps & {
  onAdd: MouseEventHandler<HTMLButtonElement>;
}) => (
  <div>
    <h3>{t`Conditional formatting`}</h3>
    <div className={CS.mt2}>
      {t`You can add rules to make the cells in this table change color if
    they meet certain conditions.`}
    </div>
    <div className={CS.mt2}>
      <Button borderless icon="add" onClick={onAdd}>
        {t`Add a rule`}
      </Button>
    </div>
    {rules.length > 0 ? (
      <div className={CS.mt2}>
        <h3>{t`Rules will be applied in this order`}</h3>
        <div className={CS.mt2}>{t`Click and drag to reorder.`}</div>
        <SortableRuleList
          rules={rules}
          cols={cols}
          onEdit={onEdit}
          onRemove={onRemove}
          onMove={onMove}
        />
      </div>
    ) : null}
  </div>
);
