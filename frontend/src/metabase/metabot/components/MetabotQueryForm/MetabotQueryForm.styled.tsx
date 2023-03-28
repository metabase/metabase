import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const QueryEditorRoot = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1 0 auto;
  background-color: ${color("bg-white")};
`;

export const QueryEditorTitle = styled.div`
  color: ${color("text-dark")};
  font-weight: bold;
  padding: 1.5rem 2rem 1rem;
`;

export const QueryEditorContainer = styled.div`
  flex: 1 1 auto;
`;

export const QueryEditorFooter = styled.div`
  display: flex;
  justify-content: end;
  gap: 1rem;
  padding: 0 2rem 1.5rem;
`;
