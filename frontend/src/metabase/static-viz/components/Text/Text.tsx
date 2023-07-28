import { Text as VText, TextProps } from "@visx/text";

export const Text = (props: TextProps) => {
  return <VText fontFamily="Lato" fontSize="13" fill="#4C5773" {...props} />;
};
