import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const ToolbarButtonRoot = styled.button`
  display: flex;
  align-items: center;
  cursor: pointer;
  color: ${color("text-dark")};
  padding: 0.25rem 0.75rem;
  font-weight: 700;
  transition: color 200ms;

  &:hover {
    color: ${color("filter")};
  }
`;

export const ToolbarButtonIcon = styled(Icon)`
  margin-right: 0.25rem;
`;
