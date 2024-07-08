import styled from "@emotion/styled";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import { color, darken } from "metabase/lib/colors";

function getPinnedForeground(disabled: boolean) {
  return disabled ? darken(color("border"), 0.38) : color("accent4");
}

function getForeground(model: string, disabled: boolean) {
  return disabled
    ? darken(color("border"), 0.38)
    : model === "dataset"
    ? color("accent2")
    : color("brand");
}

const getItemPadding = (variant?: string) => {
  switch (variant) {
    case "list":
      return "1rem";
    case "small":
      return "0.5rem 1rem";
    default:
      return "1rem 0";
  }
};

export const EntityIconWrapper = styled(IconButtonWrapper)<{
  isPinned?: boolean;
  disabled?: boolean;
}>`
  background-color: transparent;
  padding: 12px;
  cursor: ${props => (props.disabled ? "default" : "pointer")};
  color: ${props =>
    props.isPinned
      ? getPinnedForeground(!!props.disabled)
      : getForeground("", !!props.disabled)};
`;

export const EntityItemWrapper = styled.div<{
  variant?: string;
  disabled?: boolean;
}>`
  display: flex;
  align-items: center;
  padding: ${props => getItemPadding(props.variant)};
  color: ${props =>
    props.disabled ? color("text-medium") : color("text-dark")};

  &:hover {
    color: ${props => (props.disabled ? color("text-medium") : color("brand"))};
  }
`;

export const EntityItemSpinner = styled(LoadingSpinner)`
  display: flex;
  flex-direction: column;
  justify-content: center;
  color: ${color("brand")};
`;

export const EntityMenuContainer = styled.div`
  display: flex;
  align-items: center;
  color: ${color("text-medium")};
`;

export const EntityItemActions = styled.div`
  display: flex;
  align-items: center;
  margin-left: auto;
  padding-right: 0.5rem;
`;
