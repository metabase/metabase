import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { Button } from "metabase/core/components/Button";

export const SnippetButton = styled(Button)`
  color: ${color("brand")};
  background-color: ${color("bg-light")};
  margin-top: 0.5rem;

  &:hover {
    color: ${color("white")};
    background-color: ${color("brand")};
  }
`;
