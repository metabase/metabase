import styled from "@emotion/styled";

interface GaugeArcPathProps {
  isClickable: boolean;
}

export const GaugeArcPath = styled.path<GaugeArcPathProps>`
  cursor: ${props => props.isClickable && "pointer"};
`;
