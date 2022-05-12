import React from "react";
import { Text as VText, TextProps } from "@visx/text";

export const Text = (props: TextProps) => {
  return (
    <VText
      fontFamily="var(--default-font-family), sans-serif"
      fontSize="13"
      fill="#4C5773"
      {...props}
    />
  );
};
