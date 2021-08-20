/* eslint-disable react/prop-types */
import React from "react";

import { t } from "ttag";

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
  triggerElement = t`Columns`,
  ...props
}) {
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
              label={isAll && onSelectNone ? t`Select None` : t`Select All`}
              checked={isAll}
              indeterminate={!isAll && !isNone}
              disabled={isAll && !onSelectNone}
              onChange={() => {
                if (isAll) {
                  onSelectNone();
                } else {
                  onSelectAll();
                }
              }}
              className="mr1"
            />
          </li>
        )}
        {dimensions.map(dimension => (
          <li key={dimension.key()} className="px1 pb1 flex align-center">
            <CheckBox
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
