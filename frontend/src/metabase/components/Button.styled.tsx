import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";

const FONT_SIZE_VARIANTS = {
  small: "0.875em",
  medium: "1em",
};

export const TextButton = styled(Button)<{ size: "small" | "medium" }>`
  color: ${color("text-medium")};
  font-size: ${props =>
    FONT_SIZE_VARIANTS[props.size] || FONT_SIZE_VARIANTS.medium};
  border: none;
  padding: 0;
  background-color: transparent;

  &:hover {
    background-color: transparent;
    color: ${color("text-brand")};
  }
`;
