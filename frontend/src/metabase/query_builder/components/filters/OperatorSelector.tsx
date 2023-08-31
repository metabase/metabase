import cx from "classnames";
import Select, { Option } from "metabase/core/components/Select";
import type { FilterOperatorDisplayInfo } from "metabase-lib";

export function OperatorSelector({
  operatorName,
  operators,
  onOperatorChange,
  className,
}: {
  operatorName: string;
  operators: FilterOperatorDisplayInfo[];
  onOperatorChange: (operatorName: string) => void;
  className?: string;
}) {
  return (
    <Select
      value={operatorName}
      onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
        onOperatorChange(e.target.value)
      }
      className={cx("border-medium text-default", className)}
      data-testid="operator-select"
    >
      {operators.map(o => (
        <Option key={o.shortName} value={o.shortName}>
          {o.longDisplayName}
        </Option>
      ))}
    </Select>
  );
}
