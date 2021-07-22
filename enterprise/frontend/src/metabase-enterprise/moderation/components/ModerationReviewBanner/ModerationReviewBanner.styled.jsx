import styled from "styled-components";
import { color } from "metabase/lib/colors";
import Button from "metabase/components/Button";
import Icon from "metabase/components/Icon";

export const Container = styled.div`
  padding: 1rem 1rem 1rem 0.5rem;
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
  font-weight: 700;
`;

export const Time = styled.time`
  color: ${color("text-medium")};
  font-size: 11px;
`;

export const IconButton = styled(Button)`
  padding: 0 0 0 0.5rem !important;
  border: none;
  background-color: transparent;

  &:hover {
    background-color: transparent;
    color: ${color("danger")};
  }
`;

export const StatusIcon = styled(Icon)`
  padding: 0 0.5rem;
`;
