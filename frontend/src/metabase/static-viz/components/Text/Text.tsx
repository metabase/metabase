import type { TextProps } from "@visx/text";
import { Text as VText } from "@visx/text";

import type { ColorPalette } from "metabase/lib/colors/types";

type Props = Omit<TextProps, "color"> & {
  color?: keyof ColorPalette;
};

export const Text = (props: Props) => {
  // eslint-disable-next-line metabase/no-color-literals
  return <VText fontFamily="Lato" fontSize="13" fill="#4C5773" {...props} />;
};
