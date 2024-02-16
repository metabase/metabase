import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const EditGroupButton = styled.li`
  cursor: pointer;
  padding: 0.5rem 1rem;

  &:hover {
    color: ${color("white")};
    background-color: ${color("brand")};
  }
`;

export const DeleteModalTrigger = styled.li`
  color: ${color("error")};
  cursor: pointer;
  padding: 0.5rem 1rem;

  &:hover {
    color: ${color("white")};
    background-color: ${color("brand")};
  }
`;
