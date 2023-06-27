import { styled } from "metabase/ui/utils";

export interface GaugeArcPathProps {
  isClickable: boolean;
}

export const GaugeArcPath = styled.path<GaugeArcPathProps>`
  cursor: ${props => props.isClickable && "pointer"};
`;
