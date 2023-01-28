import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const DeleteDatabaseModalRoot = styled.form`
  display: flex;
  flex-direction: column;
`;

export const DeleteDatabaseModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-top: 1rem;

  & > * + * {
    margin-left: 0.5rem;
  }
`;

export const DeleteDatabaseModalSection = styled.div`
  & + & {
    margin-top: 1.5rem;
  }
`;

export const ErrorMessage = styled.div`
  color: ${color("error")};
  padding: 0 1rem;
`;

export const DatabaseNameInputContainer = styled.div`
  width: 300px;
`;
