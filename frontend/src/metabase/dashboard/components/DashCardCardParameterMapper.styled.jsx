import styled, { css } from "styled-components";

import { forwardRefToInnerRef } from "metabase/styled-components/utils";
import { space } from "metabase/styled-components/theme";
import { color, lighten } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import Button from "metabase/components/Button";

export const Container = styled.div`
  margin: ${space(1)} 0;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

export const CardLabel = styled.div`
  font-size: 0.83em;
  margin-bottom: ${space(1)};
  text-weight: bold;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
  max-width: 100px;
`;

export const Header = styled.h4`
  color: ${color("text-medium")};
  margin-bottom: ${space(1)};
`;

export const TargetButton = forwardRefToInnerRef(styled.div.attrs({
  tabIndex: 0,
  role: "button",
})`
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: ${color("white")};
  text-weight: bold;
  cursor: pointer;
  font-size: 1.2em;
  border: 2px solid ${color("brand")};
  border-radius: 8px;
  min-height: 30px;
  min-width: 100px;
  padding: 0.25em 0.5em;
  color: ${color("text-medium")};

  ${({ variant }) =>
    variant === "disabled" &&
    css`
      pointer-events: none;
      opacity: 0.4;
      border-color: inherit;
    `}

  ${({ variant }) =>
    variant === "mapped" &&
    css`
      border-color: ${color("brand")};
      background-color: ${color("brand")};
      color: ${color("white")};
    `}

  ${({ variant }) =>
    variant === "unauthed" &&
    css`
      pointer-events: none;
      border-color: ${color("bg-light")};
      background-color: ${color("bg-light")};
      color: ${color("text-medium")};
    `}
`);

export const TargetButtonText = styled.span`
  text-align: center;
  margin-right: ${space(1)};
`;

export const CloseIconButton = styled(Button).attrs({
  icon: "close",
  size: 12,
})`
  color: ${color("white")};
  background-color: transparent;
  border: none;
  padding: ${space(0)} !important;

  &:hover {
    color: ${color("white")};
    background-color: ${lighten("brand", 0.2)};
  }
`;

export const ChevrondownIcon = styled(Icon).attrs({
  name: "chevrondown",
  size: 12,
})`
  margin-top: 2px;
`;

export const KeyIcon = styled(Icon).attrs({
  name: "key",
  size: 18,
})`
  flex: 1;
`;

export const Warning = styled.span`
  margin-top: ${space(1)};
  margin-bottom: -${space(1)};
  padding: ${space(4)} 0;
  text-align: center;
`;
