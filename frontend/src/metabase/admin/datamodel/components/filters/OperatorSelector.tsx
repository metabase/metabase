import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { Select } from "metabase/ui";
import type { FilterOperator } from "metabase-lib/v1/deprecated-types";

// Using deprecated types from metabase-lib v1 to avoid breaking changes. We should update this ASAP
const OperatorSelector = ({
  operator,
  operators,
  onOperatorChange,
  className,
}: {
  operator: FilterOperator["name"];
  operators: FilterOperator[] | null | undefined;
  onOperatorChange: (operator: FilterOperator["name"]) => void;
  className?: string;
}) => (
  <Select
    data={(operators ?? []).map(o => ({ value: o.name, label: o.verboseName }))}
    value={operator}
    onChange={onOperatorChange}
    className={cx(CS.borderMedium, CS.textDefault, className)}
    data-testid="operator-select"
  />
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default OperatorSelector;
