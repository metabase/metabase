import type { Ref } from "react";
import { forwardRef } from "react";

import type { TextInputProps } from "metabase/ui";
import { TextInput } from "metabase/ui";

import { CopyWidgetButton } from "./CopyTextInput.styled";

const defaultProps = {
  readOnly: true,
  value: "copy me",
};

export const CopyTextInput = forwardRef(function CopyTextInput(
  props: TextInputProps & { value: string },
  ref: Ref<HTMLInputElement>,
) {
  return (
    <TextInput
      {...defaultProps}
      {...props}
      ref={ref}
      rightSection={<CopyWidgetButton value={props.value} />}
      rightSectionWidth={40}
    />
  );
});
