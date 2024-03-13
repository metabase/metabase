import styled from "@emotion/styled";

import { Icon } from "metabase/ui";

export const DisclosureTriangle = styled(Icon)<{ open: boolean }>`
  transition: transform 300ms ease-out;
  ${props => (props.open ? "" : "transform: rotate(-90deg)")};
  [dir="rtl"] & {
    ${props => (props.open ? "" : "transform: rotate(90deg)")};
  }
`;
