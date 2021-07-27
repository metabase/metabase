import styled from "styled-components";
import { color } from "metabase/lib/colors";
import ActionButton from "metabase/components/ActionButton";
import Button from "metabase/components/Button";

export const SidebarSectionHeader = styled.div`
  color: ${color("text-medium")};
  font-weight: bold;
  padding-bottom: 1rem;
`;

export const RequestButton = styled(Button)`
  padding: 0;
  border: none;
  color: ${props => color(props.color)};

  &:hover {
    text-decoration: underline;
    background-color: transparent;
    color: ${props => color(props.color)};
  }
`;

export const RevertButton = styled(ActionButton).attrs({
  successClassName: "",
  failedClassName: "",
})`
  padding: 0;
  border: none;
  color: ${color("text-dark")};
  font-size: 0.875em;

  &:hover {
    background-color: transparent;
    color: ${color("accent3")};
  }
`;
