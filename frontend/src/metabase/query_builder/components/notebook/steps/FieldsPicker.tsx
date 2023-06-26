import * as React from "react";
import { t } from "ttag";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import CheckBox from "metabase/core/components/CheckBox";
import StackedCheckBox from "metabase/components/StackedCheckBox";

import type Dimension from "metabase-lib/Dimension";

interface FieldsPickerProps {
  className?: string;
  dimensions: Dimension[];
  selectedDimensions: Dimension[];
  isAll?: boolean;
  isNone?: boolean;
  onSelectAll?: () => void;
  onSelectNone?: () => void;
  onToggleDimension: (dimension: Dimension, isSelected: boolean) => void;
  triggerElement?: React.ReactNode;
  disableSelected?: boolean;
}

function FieldsPicker({
  className,
  dimensions,
  selectedDimensions,
  isAll,
  isNone,
  onSelectAll,
  onSelectNone,
  onToggleDimension,
  triggerElement = t`Columns`,
  disableSelected,
  ...props
}: FieldsPickerProps) {
  const selected = new Set(selectedDimensions.map(d => d.key()));
  return (
    <PopoverWithTrigger
      triggerElement={triggerElement}
      triggerClasses={className}
      sizeToFit
      {...props}
    >
      <ul className="pt1">
        {(onSelectAll || onSelectNone) && (
          <li className="px1 pb1 flex align-center border-bottom mb1">
            <StackedCheckBox
              label={isAll && onSelectNone ? t`Select none` : t`Select all`}
              checked={isAll}
              indeterminate={!isAll && !isNone}
              disabled={isAll && !onSelectNone}
              onChange={() => {
                if (isAll) {
                  onSelectNone?.();
                } else {
                  onSelectAll?.();
                }
              }}
              className="mr1"
            />
          </li>
        )}
        {dimensions.map(dimension => (
          <li key={dimension.key()} className="px1 pb1 flex align-center">
            <CheckBox
              disabled={disableSelected && selected.has(dimension.key())}
              checked={selected.has(dimension.key())}
              label={dimension.displayName()}
              onChange={() => {
                onToggleDimension(dimension, !selected.has(dimension.key()));
              }}
              className="mr1"
            />
          </li>
        ))}
      </ul>
    </PopoverWithTrigger>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FieldsPicker;
