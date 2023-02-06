import styled from "@emotion/styled";
import { color, tint, isDark } from "metabase/lib/colors";

export interface OptionRootProps {
  isSelected?: boolean;
}

const getOptionIconColor = ({ isSelected }: OptionIconContainerProps) => {
  if (isSelected) {
    return color("white");
  } else if (isDark("brand")) {
    return tint("brand", 0.5);
  } else {
    return color("brand");
  }
};

export const OptionRoot = styled.div<OptionRootProps>`
  padding: 0.5rem;
  width: 25%;
  text-align: center;

  ${props =>
    props.isSelected &&
    `
    ${OptionIconContainer} {
      background-color: ${color("brand")};
      color: ${getOptionIconColor(props)};
      border: 1px solid transparent;
    }

    ${OptionText} {
      color: ${color("brand")};
    }
  `}
`;

export interface OptionIconContainerProps {
  isSelected?: boolean;
}

export const OptionText = styled.div`
  margin-top: 0.5rem;
  color: ${color("text-medium")};
  font-weight: bold;
  font-size: 0.75rem;
`;

export const OptionIconContainer = styled.div<OptionIconContainerProps>`
  display: inline-flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: ${getOptionIconColor};
  background-color: ${props => props.isSelected && color("brand")};
  border-radius: 100%;
  border: 1px solid ${color("border")};
  cursor: pointer;
  padding: 0.875rem;
  &:hover {
    color: ${color("white")};
    background-color: ${color("brand")};
    border: 1px solid transparent;
  }
`;

export const OptionLabel = styled.h4`
  color: ${color("text-medium")};
  font-weight: bold;
  font-size: 0.75rem;
  text-transform: uppercase;
  margin: 1rem 0 1rem 1.5rem;
`;

export const OptionList = styled.div`
  display: flex;
  margin: 1rem 1rem 3rem 1rem;
  flex-wrap: wrap;
`;
