import type {
  SegmentedControlItem as MantineSegmentedControlItem,
  SegmentedControlProps as MantineSegmentedControlProps,
} from "@mantine/core";
import { SegmentedControl as MantineSegmentedControl } from "@mantine/core";
export { segmentedControlOverrides } from "./SegmentedControl.config";

export interface SegmentedControlItem<Value extends string>
  extends Omit<MantineSegmentedControlItem, "value"> {
  value: Value;
}

export interface SegmentedControlProps<Value extends string>
  extends Omit<MantineSegmentedControlProps, "data" | "value" | "onChange"> {
  data: SegmentedControlItem<Value>[] | Value[];
  value?: Value;
  onChange?: (value: Value) => void;
}

export function SegmentedControl<Value extends string = string>(
  props: SegmentedControlProps<Value>,
) {
  return (
    // @ts-expect-error -- our tighter types are better
    <MantineSegmentedControl {...props} />
  );
}
