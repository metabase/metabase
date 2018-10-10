import React from "react";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";

import { getColorScale } from "metabase/lib/colors";

import d3 from "d3";
import cx from "classnames";

const ColorRangePicker = ({
  value,
  onChange,
  ranges,
  className,
  style,
  sections = 5,
  quantile = false,
  columns = 2,
}) => (
  <PopoverWithTrigger
    triggerElement={
      <ColorRangePreview
        colors={value}
        className={cx(className, "bordered rounded overflow-hidden")}
        style={{ height: 30, ...style }}
        sections={sections}
        quantile={quantile}
      />
    }
  >
    {({ onClose }) => (
      <div className="pt1 mr1 flex flex-wrap" style={{ width: 300 }}>
        {ranges.map(range => (
          <div
            className={"mb1 pl1"}
            style={{ flex: `1 1 ${Math.round(100 / columns)}%` }}
          >
            <ColorRangePreview
              colors={range}
              onClick={() => {
                onChange(range);
                onClose();
              }}
              className={cx("bordered rounded overflow-hidden cursor-pointer")}
              style={{ height: 30 }}
              sections={sections}
              quantile={quantile}
            />
          </div>
        ))}
      </div>
    )}
  </PopoverWithTrigger>
);

export const ColorRangePreview = ({
  colors = [],
  sections = 5,
  quantile = false,
  className,
  ...props
}) => {
  const scale = getColorScale([0, sections - 1], colors, quantile);
  return (
    <div className={cx(className, "flex")} {...props}>
      {d3
        .range(0, sections)
        .map(value => (
          <div className="flex-full" style={{ background: scale(value) }} />
        ))}
    </div>
  );
};

export default ColorRangePicker;
