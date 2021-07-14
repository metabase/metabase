import styled from "styled-components";
import { color } from "metabase/lib/colors";
import Button from "metabase/components/Button";

export const Container = styled.div`
  padding: 1rem;
  background-color: ${props => props.backgroundColor};
  display: flex;
  justify-content: space-between;
  align-items: center;
  column-gap: 0.5rem;
  border-radius: 8px;
`;

export const Text = styled.span`
  flex: 1;
  font-size: 14px;
`;

export const Time = styled.time`
  color: ${color("text-medium")};
  font-size: 12px;
`;

export const IconButton = styled(Button).attrs({
  iconOnly: true,
})`
  padding: 0 !important;
  border: none;
  background-color: transparent;

  &:hover {
    background-color: transparent;
    color: ${color("text-medium")};
  }
`;
