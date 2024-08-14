import type { TextProps } from "@visx/text";
import { Text as VText } from "@visx/text";

export const Text = (props: TextProps) => {
  return <VText fontFamily="Lato" fontSize="13" fill="#4C5773" {...props} />;
};
