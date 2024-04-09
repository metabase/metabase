import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const SidebarIcon = styled(Icon)`
  color: ${color("text-light")};
  margin-right: 0.5rem;
`;

export const SidebarFooter = styled.div`
  display: flex;
  padding: 1rem;
  font-size: 0.875em;
  color: ${color("text-medium")};
  cursor: pointer;

  &:hover {
    color: ${color("brand")};

    ${SidebarIcon} {
      color: ${color("brand")};
    }
  }
`;

export const SnippetTitle = styled.span`
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;

interface SearchSnippetIconProps {
  isHidden?: boolean;
}

export const SearchSnippetIcon = styled(Icon)<SearchSnippetIconProps>`
  display: ${props => props.isHidden && "none"};
  cursor: pointer;
  margin-right: 0.5rem;

  &:hover {
    color: ${color("brand")};
  }
`;

interface AddSnippetIconProps {
  isHidden?: boolean;
}

export const AddSnippetIcon = styled(Icon)<AddSnippetIconProps>`
  display: ${props => props.isHidden && "none"};
  color: ${color("brand")};
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 0.5rem;

  &:hover {
    background-color: ${color("bg-light")};
  }
`;

export const MenuIconContainer = styled.div`
  display: flex;
  padding: 1rem;
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
    background-color: ${color("bg-medium")};
  }
`;

interface HideSearchIconProps {
  isHidden?: boolean;
}

export const HideSearchIcon = styled(Icon)<HideSearchIconProps>`
  display: ${props => props.isHidden && "none"};
  cursor: pointer;
  padding: 0.5rem;

  &:hover {
    color: ${color("brand")};
  }
`;
