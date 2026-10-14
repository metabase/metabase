import {
  TagsInput as MantineTagsInput,
  type TagsInputProps as MantineTagsInputProps,
} from "@mantine/core";
import { forwardRef } from "react";

export type TagsInputProps = Omit<MantineTagsInputProps, "size"> & {
  size?: "md" | "lg";
};

export const TagsInput = forwardRef<HTMLInputElement, TagsInputProps>(
  function TagsInput(props, ref) {
    return <MantineTagsInput {...props} ref={ref} />;
  },
);

export { tagsInputOverrides } from "./TagsInput.config";
