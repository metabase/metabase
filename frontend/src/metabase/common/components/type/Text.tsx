// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import type { ColorName } from "metabase/lib/colors/types";
import { color } from "metabase/ui/utils/colors";

interface TextProps {
  color?: string;
  fontSize?: string;
  fontWeight?: number;
}

export const Text = styled.div<TextProps>`
  color: ${(props) =>
    // text-${color} may not be a registered color key; the CSS variable
    // falls back to inherited color when undefined
    color(`text-${props.color ?? "medium"}` as ColorName)};
  font-size: ${(props) => props.fontSize};
  font-weight: ${(props) => props.fontWeight};
`;
