import styled from "@emotion/styled";
import { Icon } from "metabase/core/components/Icon";
import { color } from "metabase/lib/colors";

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

interface SnippetSearchIconProps {
  isHidden?: boolean;
}

export const SnippetSearchIcon = styled(Icon)<SnippetSearchIconProps>`
  display: ${props => props.isHidden && "none"};
  cursor: pointer;
  margin-right: 0.5rem;

  &:hover {
    color: ${color("brand")};
  }
`;

interface SnippetAddIconProps {
  isHidden?: boolean;
}

export const SnippetAddIcon = styled(Icon)<SnippetAddIconProps>`
  display: ${props => props.isHidden && "none"};
  color: ${color("brand")};
  cursor: pointer;
  border-radius: 0.5rem;

  &:hover {
    background-color: ${color("bg-light")};
  }
`;
