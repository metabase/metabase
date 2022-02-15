import styled from "@emotion/styled";
import { color, lighten } from "metabase/lib/colors";

export interface OptionRootProps {
  isSensible?: boolean;
}

export const OptionRoot = styled.div<OptionRootProps>`
  padding: 0.5rem;
  width: 33.33%;
  opacity: ${props => (!props.isSensible ? 0.25 : 1)};
  text-align: center;
`;

export interface OptionIconContainerProps {
  isSelected?: boolean;
}

export const OptionIconContainer = styled.div<OptionIconContainerProps>`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background-color: ${props =>
    props.isSelected ? color("brand") : lighten("brand")};
  padding: 0.75rem;
  border-radius: 0.625rem;
`;

export const OptionText = styled.div`
  margin-top: 0.5rem;
  color: ${color("brand")};
  font-weight: bold;
`;

export const OptionList = styled.div`
  display: flex;
  margin: 0 1rem 0.5rem 1rem;
  flex-wrap: wrap;
`;
