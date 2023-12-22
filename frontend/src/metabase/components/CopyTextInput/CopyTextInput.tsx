import { forwardRef } from "react";
import type { Ref } from "react";

import { TextInput } from "metabase/ui";
import type { TextInputProps } from "metabase/ui";
import { CopyWidgetButton } from "./CopyTextInput.styled";

export const CopyTextInput = forwardRef(function CopyTextInput(
  props: TextInputProps,
  ref: Ref<HTMLInputElement>,
) {
  return (
    <TextInput
      {...props}
      ref={ref}
      rightSection={<CopyWidgetButton value={props.value} />}
      rightSectionWidth={40}
    />
  );
});
