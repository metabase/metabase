import {
  MultiSelect as MantineMultiSelect,
  type MultiSelectProps as MantineMultiSelectProps,
} from "@mantine/core";
import { forwardRef } from "react";

export type MultiSelectProps = Omit<MantineMultiSelectProps, "size"> & {
  size?: "md" | "lg";
};

export const MultiSelect = forwardRef<HTMLInputElement, MultiSelectProps>(
  function MultiSelect(props, ref) {
    return <MantineMultiSelect {...props} ref={ref} />;
  },
);

export { multiSelectOverrides } from "./MultiSelect.config";
