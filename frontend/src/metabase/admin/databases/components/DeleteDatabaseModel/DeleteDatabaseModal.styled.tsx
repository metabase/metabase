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

interface DeleteDatabaseModalSectionProps {
  isHidden?: boolean;
}

export const DeleteDatabaseModalSection = styled.div<DeleteDatabaseModalSectionProps>`
  height: ${props => (props.isHidden ? 0 : "unset")};
  opacity: ${props => (props.isHidden ? 0 : 1)};
  padding: 0.125rem;
  transition: all 350ms, opacity 200ms;
  overflow: hidden;

  & + & {
    margin-top: 1.25rem;
  }
`;

export const ErrorMessage = styled.div`
  color: ${color("error")};
  padding: 0 1rem;
`;

export const DatabaseNameInputContainer = styled.div`
  padding: 0.125rem 0;
  width: 300px;
`;
