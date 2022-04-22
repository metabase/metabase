import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const ChangeTypeButton = styled.button`
  padding: 0 0.25rem;
  color: ${color("accent7")};
  cursor: pointer;
  vertical-align: middle;
`;

export const UserTypeCellRoot = styled.td`
  text-transform: capitalize;
  text-decoration: underline;
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
