import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const ActionCreatorBodyContainer = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-top: 1px solid ${color("border")};
  grid-gap: ${space(2)};
  .react-resizable-handle {
    display: none;
  }
  flex: 1;
  overflow-y: auto;
`;

export const EditorContainer = styled.div`
  padding-left: ${space(2)};
  flex: 1 1 0;
  overflow-y: auto;
  background-color: ${color("bg-light")};
`;

export const ModalFooter = styled.div`
  border-top: 1px solid ${color("border")};
  display: flex;
  flex: 0 0 auto;
  justify-content: flex-end;
  gap: 1rem;
  padding: 1.5rem 2rem;
`;

export const ModalRoot = styled.div`
  display: flex;
  flex-direction: column;
  height: 90vh;
`;
