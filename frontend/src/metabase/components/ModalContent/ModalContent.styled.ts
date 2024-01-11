import styled from "@emotion/styled";
import { Icon } from "metabase/ui";
import { color } from "metabase/lib/colors";

export const HeaderContainer = styled.div`
  padding: 2rem;
  width: 100%;

  flex-shrink: 0;

  display: flex;
  flex-direction: row;
  gap: 0.5rem;

  align-items: center;
`;

export const HeaderText = styled.h2`
  font-weight: 700;

  flex-grow: 1;

  display: flex;
  align-items: center;
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
