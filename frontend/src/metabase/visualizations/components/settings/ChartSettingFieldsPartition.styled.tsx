import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const ShowTotalsOptionRoot = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 1rem;
`;

export const SortOrderOptionRoot = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 0.5rem;
`;

export const FormattingOptionsRoot = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 0.5rem;
`;

export const ExpandIconContainer = styled.span`
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;

export interface SortButtonIconProps {
  isSelected: boolean;
}

export const SortButtonIcon = styled(Icon)<SortButtonIconProps>`
  cursor: pointer;
  color: ${props => (props.isSelected ? color("brand") : color("text-medium"))};

  &:hover {
    color: ${props => !props.isSelected && color("brand")};
  }
`;
