import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const ChangeTypeButton = styled.button`
  padding: 0 0.25rem;
  color: ${color("filter")};
  cursor: pointer;
  vertical-align: middle;
`;

export const UserTypeCellRoot = styled.td`
  text-transform: capitalize;
  font-size: 14px;
  font-weight: bold;
  color: ${color("text-medium")};

  ${ChangeTypeButton} {
    visibility: hidden;
  }

  &:hover {
    ${ChangeTypeButton} {
      visibility: visible;
    }
  }
`;
