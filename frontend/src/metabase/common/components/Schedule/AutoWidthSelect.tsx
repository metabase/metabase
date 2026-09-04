import { useMemo } from "react";

import { useSelector } from "metabase/redux";
import { getSetting } from "metabase/settings";
import type { SelectProps } from "metabase/ui";
import { Select } from "metabase/ui";
import type { FontStyle } from "metabase/utils/measure-text";

import { getLongestSelectLabel, measureTextWidthSafely } from "./utils";

/** A Select that is automatically sized to fit its largest option name */
export const AutoWidthSelect = <Value extends string | null>({
  style,
  value,
  ...props
}: { style?: Partial<FontStyle>; value: Value } & SelectProps<Value>) => {
  const fontFamily = useSelector((state) =>
    getSetting(state, "application-font"),
  );
  const width = useMemo(() => {
    const fontStyle = { family: fontFamily, ...style };
    const longestLabel = getLongestSelectLabel(props.data, fontFamily);
    const labelWidth = measureTextWidthSafely(longestLabel, 50, fontStyle);
    const placeholderWidth = props.placeholder
      ? measureTextWidthSafely(props.placeholder, 50, fontStyle)
      : 0;

    return Math.max(labelWidth, placeholderWidth) + 60;
  }, [props.data, props.placeholder, style, fontFamily]);
  return (
    <Select
      styles={{
        wrapper: { width },
        root: { flexShrink: 0 },
      }}
      value={value}
      {...props}
    />
  );
};
