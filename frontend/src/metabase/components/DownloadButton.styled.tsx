import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const FormButton = styled.button`
  display: flex;
  align-items: center;
  width: 100%;
  margin: 0.5rem 0;
  padding: 0.5rem;
  border-radius: 0.5rem;
  cursor: pointer;

  &:hover {
    color: ${color("white")};
    background-color: ${color("brand")};
  }
`;
