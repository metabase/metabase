import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/core/components/Icon";

export const RefreshWidgetPopover = styled.div`
  padding: 1rem;
  min-width: 12.5rem;
`;

export const RefreshWidgetTitle = styled.div`
  color: ${color("text-medium")};
  font-weight: bold;
  font-size: 0.75em;
  text-transform: uppercase;
  margin-bottom: 1em;
  margin-left: 0.5em;
`;

export const RefreshOptionIcon = styled(Icon)`
  margin-right: 0.5em;
`;

export interface RefreshOptionItemProps {
  isEnabled: boolean;
  isSelected: boolean;
}

export const RefreshOptionItem = styled.li<RefreshOptionItemProps>`
  color: ${props =>
    props.isEnabled && props.isSelected
      ? color("summarize")
      : color("text-dark")};
  font-weight: bold;
  padding-top: 0.5em;
  padding-bottom: 0.5em;
  cursor: pointer;

  ${RefreshOptionIcon} {
    visibility: ${props => (props.isSelected ? "visible" : "hidden")};
  }

  &:hover {
    color: ${color("brand")};

    ${RefreshOptionIcon} {
      visibility: visible;
    }
  }
`;
