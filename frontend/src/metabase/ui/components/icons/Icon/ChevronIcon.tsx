import styled from "@emotion/styled";

import type { IconProps } from "./Icon";
import { Icon } from "./Icon";

const StyledChevronIcon = styled(Icon)`
  [dir="rtl"] & {
    transform: rotate(180deg);
  }
`;

export const ChevronIcon = (props: IconProps & { dir: "forward" | "back" }) => (
  <StyledChevronIcon
    {...props}
    name={props.dir === "forward" ? "chevronright" : "chevronleft"}
  />
);
