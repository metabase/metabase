import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const ActionCreatorRoot = styled.div`
  display: flex;
  flex-direction: column;
  height: calc(100vh - 3.25rem);
`;

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
  margin-left: ${space(2)};
  flex: 1;
  overflow-y: auto;
`;
