import { useMemo } from "react";

import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import type { SelectProps } from "metabase/ui";
import { Select } from "metabase/ui";
import type { FontStyle } from "metabase/visualizations/shared/types/measure-text";

import { getLongestSelectLabel, measureTextWidthSafely } from "./utils";

/** A Select that is automatically sized to fit its largest option name */
export const AutoWidthSelect = <Value extends string>({
  style,
  value,
  ...props
}: { style?: Partial<FontStyle>; value: Value } & SelectProps<Value>) => {
  const fontFamily = useSelector((state) =>
    getSetting(state, "application-font"),
  );
  const width = useMemo(() => {
    const longestLabel = getLongestSelectLabel(props.data, fontFamily);
    const width =
      measureTextWidthSafely(longestLabel, 50, {
        family: fontFamily,
        ...style,
      }) + 60;

    return width;
  }, [props.data, style, fontFamily]);
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
