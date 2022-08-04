import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const FooterContainer = styled.div`
  display: flex;
  padding: 1rem;
  color: ${color("text-medium")};
  font-size: 0.875em;
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;

export interface ShowSearchIconProps {
  isVisible: boolean;
}

export const ShowSearchIcon = styled(Icon)<ShowSearchIconProps>`
  display: ${props => !props.isVisible && "none"};
  margin-right: 0.5rem;
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;

export interface HideSearchIconProps {
  isVisible: boolean;
}

export const HideSearchIcon = styled(Icon)<HideSearchIconProps>`
  display: ${props => !props.isVisible && "none"};
  padding: 0.5rem;
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;

export const CloseIconContainer = styled.div`
  display: flex;
  padding: 1rem;
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
    background-color: ${color("bg-medium")};
  }
`;
