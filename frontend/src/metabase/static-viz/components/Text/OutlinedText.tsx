import React from "react";
import { Text, TextProps } from "@visx/text";

export default function OutlinedText(props: TextProps) {
  return (
    <>
      {/* Render 2 text elements instead of one as a workaround for BE environment that doesn't support `paint-order` CSS property */}
      <Text {...props} />
      <Text {...props} stroke={undefined} strokeWidth={undefined} />
    </>
  );
}
