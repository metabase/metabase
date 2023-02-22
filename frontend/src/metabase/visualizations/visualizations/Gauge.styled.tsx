import styled from "@emotion/styled";

export interface GaugeArcPathProps {
  isClickable: boolean;
}

export const GaugeArcPath = styled.path<GaugeArcPathProps>`
  cursor: ${props => props.isClickable && "pointer"};
`;
