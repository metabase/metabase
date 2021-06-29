import styled from "styled-components";
import Button from "metabase/components/Button";
import { color } from "metabase/lib/colors";

export const TextButton = styled(Button)`
  color: ${color("text-light")};
  border: none;
  padding: 0;
  background-color: transparent;

  &:hover {
    background-color: transparent;
    text-decoration: underline;
  }
`;
