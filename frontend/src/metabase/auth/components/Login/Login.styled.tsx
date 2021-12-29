import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const LoginTitle = styled.div`
  color: ${color("text-dark")};
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.5rem;
  text-align: center;
`;

export const LoginPanel = styled.div`
  margin-top: 2.5rem;
`;

export const ActionList = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 3.5rem;
`;

interface ActionItemProps {
  isFullWidth?: boolean;
}

export const ActionItem = styled.div<ActionItemProps>`
  align-self: ${props => (props.isFullWidth ? "stretch" : "")};

  &:not(:last-child) {
    margin-bottom: 2rem;
  }
`;
