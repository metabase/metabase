import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const HeaderContainer = styled.div`
  padding: 2rem;
  width: 100%;

  flex-shrink: 0;

  display: flex;
  flex-direction: row;
  gap: 0.5rem;

  align-items: center;
`;

export const HeaderText = styled.h2<{
  textCentered?: boolean;
}>`
  font-weight: 700;

  flex-grow: 1;

  display: flex;
  align-items: center;

  ${({ textCentered }) =>
    textCentered &&
    css`
      justify-content: center;
    `}
`;

export const ActionsWrapper = styled.div`
  display: flex;
  flex-direction: row;
  gap: 0.5rem;

  margin: -0.5rem -0.5rem -0.5rem 0;
`;

export const ModalContentActionIcon = styled(Icon)`
  color: ${color("text-light")};
  cursor: pointer;
  padding: 0.5rem;

  &:hover {
    color: ${color("text-medium")};
  }
`;

export const ModalHeaderBackIcon = styled(ModalContentActionIcon)`
  flex-shrink: 0;

  margin: -0.5rem 0 -0.5rem -0.5rem;

  :hover {
    color: ${color("brand")};
  }
`;

export const HeaderTextContainer = styled.div<{
  onClick?: () => void;
}>`
  display: flex;
  align-items: center;
  flex-direction: row;
  flex-grow: 1;

  ${({ onClick }) =>
    onClick &&
    css`
      &:hover > * {
        color: ${color("brand")};
        cursor: pointer;
      }
    `}
`;
