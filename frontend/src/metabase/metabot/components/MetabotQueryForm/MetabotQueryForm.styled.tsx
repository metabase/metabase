import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const QueryEditorRoot = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1 0 auto;
`;

export const QueryEditorTitle = styled.div`
  color: ${color("text-dark")};
  font-weight: bold;
  margin-bottom: 1rem;
  padding-left: 2rem;
  padding-right: 2rem;
`;

export const QueryEditorContainer = styled.div`
  flex: 1 1 0;
  min-height: 0;
  margin-bottom: 0.5rem;
`;

export const QueryEditorFooter = styled.div`
  display: flex;
  justify-content: end;
  gap: 1rem;
  padding-left: 2rem;
  padding-right: 2rem;
  padding-bottom: 1.5rem;
`;
