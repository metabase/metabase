import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";

export const SnippetButton = styled(Button)`
  color: ${color("brand")};
  background-color: var(--mb-color-bg-light);
  margin-top: 0.5rem;

  &:hover {
    color: ${color("white")};
    background-color: ${color("brand")};
  }
`;

export const SnippetContent = styled.div`
  display: flex;

  &:hover {
    color: ${color("brand")};
  }
`;
