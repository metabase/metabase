import styled from "styled-components";
import Button from "metabase/components/Button";
import { color } from "metabase/lib/colors";

export const TextButton = styled(Button)`
  color: ${color("text-medium")};
  font-size: ${props => (props.small ? "0.875em" : "1em")};
  border: none;
  padding: 0;
  background-color: transparent;

  &:hover {
    background-color: transparent;
    color: ${color("text-brand")};
  }
`;
