import type { TextProps } from "@visx/text";
import { Text } from "@visx/text";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function OutlinedText(props: TextProps) {
  return (
    <>
      {/* Render 2 text elements instead of one as a workaround for BE environment that doesn't support `paint-order` CSS property */}
      <Text {...props} />
      <Text {...props} stroke={undefined} strokeWidth={undefined} />
    </>
  );
}
