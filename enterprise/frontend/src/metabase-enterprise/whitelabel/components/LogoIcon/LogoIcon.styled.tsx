import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

interface LogoIconRootProps {
  isDark?: boolean;
}

export const LogoIconRoot = styled.span<LogoIconRootProps>`
  color: ${props => (props.isDark ? color("white") : color("brand"))};
  text-align: center;
`;
