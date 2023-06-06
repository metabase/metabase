import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { space } from "metabase/styled-components/theme";
import { color, lighten } from "metabase/lib/colors";
import { Icon } from "metabase/core/components/Icon";
import Button from "metabase/core/components/Button";
import ExternalLink from "metabase/core/components/ExternalLink";

export const Container = styled.div`
  margin: ${space(1)} 0;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

export const TextCardDefault = styled.div`
  color: ${color("text-dark")};
  margin: ${space(1)} 0;
  display: flex;
  flex-direction: row;
  align-items: baseline;
  line-height: 1.5rem;
`;

export const NativeCardDefault = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

export const NativeCardIcon = styled(Icon)`
  color: ${color("text-medium")};
  margin-bottom: 0.5rem;
  width: 1.25rem;
  height: 1.25rem;
`;

export const NativeCardText = styled.div`
  color: ${color("text-dark")};
  max-width: 15rem;
  text-align: center;
  line-height: 1.5rem;
`;

export const NativeCardLink = styled(ExternalLink)`
  color: ${color("brand")};
  font-weight: bold;
  margin-top: 0.5rem;
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

export const TargetButton = styled.div`
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
`;

TargetButton.defaultProps = {
  tabIndex: 0,
  role: "button",
};

export const TargetButtonText = styled.span`
  text-align: center;
  margin-right: ${space(1)};
`;

export const CloseIconButton = styled(Button)`
  color: ${color("white")};
  background-color: transparent;
  border: none;
  padding: ${space(0)} !important;

  &:hover {
    color: ${color("white")};
    background-color: ${lighten("brand", 0.2)};
  }
`;

CloseIconButton.defaultProps = {
  icon: "close",
  size: 12,
};

export const ChevrondownIcon = styled(Icon)`
  margin-top: 2px;
`;

ChevrondownIcon.defaultProps = {
  name: "chevrondown",
  size: 12,
};

export const KeyIcon = styled(Icon)`
  flex: 1;
`;

KeyIcon.defaultProps = {
  name: "key",
  size: 18,
};

export const Warning = styled.span`
  margin-top: ${space(1)};
  margin-bottom: -${space(1)};
  padding: ${space(4)} 0;
  text-align: center;
`;
