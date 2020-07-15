import React from "react";

import { t } from "ttag";
import cx from "classnames";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import CheckBox from "metabase/components/CheckBox";
import StackedCheckBox from "metabase/components/StackedCheckBox";

export default function FieldsPicker({
  className,
  dimensions,
  selectedDimensions,
  isAll,
  isNone,
  onSelectAll,
  onSelectNone,
  onToggleDimension,
}) {
  const selected = new Set(selectedDimensions.map(d => d.key()));
  return (
    <PopoverWithTrigger
      triggerElement={t`Columns`}
      triggerClasses={className}
      sizeToFit
    >
      <ul className="pt1">
        {(onSelectAll || onSelectNone) && (
          <li
            className={cx(
              "px1 pb1 flex align-center cursor-pointer border-bottom mb1",
              { disabled: isAll && !onSelectNone },
            )}
            onClick={() => {
              if (isAll) {
                onSelectNone();
              } else {
                onSelectAll();
              }
            }}
          >
            <StackedCheckBox
              checked={isAll}
              indeterminate={!isAll && !isNone}
              className="mr1"
            />
            {isAll && onSelectNone ? t`Select None` : t`Select All`}
          </li>
        )}
        {dimensions.map(dimension => (
          <li
            key={dimension.key()}
            className="px1 pb1 flex align-center cursor-pointer"
            onClick={() => {
              onToggleDimension(dimension, !selected.has(dimension.key()));
            }}
          >
            <CheckBox checked={selected.has(dimension.key())} className="mr1" />
            {dimension.displayName()}
          </li>
        ))}
      </ul>
    </PopoverWithTrigger>
  );
}
