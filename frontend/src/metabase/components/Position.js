import styled from "styled-components";
import { Box } from "grid-styled";
import { top, left, bottom, right } from "styled-system";

export const Position = styled(Box)`
    ${top}
    ${left}
    ${bottom}
    ${right}
`;

Position.displayName = "Position";

export const Relative = styled(Position)`
  position: relative;
`;

Relative.displayName = "Relative";

export const Absolute = styled(Position)`
  position: absolute;
`;

Absolute.displayName = "Absolute";

export const Fixed = styled(Position)`
  position: fixed;
`;

Fixed.displayName = "Fixed";

export const Sticky = styled(Position)`
  position: sticky;
`;
