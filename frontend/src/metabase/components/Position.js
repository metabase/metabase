import styled from "styled-components";

// import Box to get its spacing props, p, m, etc
import { Box } from "grid-styled";

// gives us top, left, bottom, right props
import { top, left, bottom, right } from "styled-system";

export const Position = styled(Box)`
    ${top}
    ${left}
    ${bottom}
    ${right}
`;

Position.displayName = "Position";

export const Relative = Position.extend`
  position: relative;
`;

Relative.displayName = "Relative";

export const Absolute = Position.extend`
  position: absolute;
`;

Absolute.displayName = "Absolute";

export const Fixed = Position.extend`
  position: fixed;
`;

Fixed.displayName = "Fixed";

export const Sticky = Position.extend`
  position: sticky;
`;
