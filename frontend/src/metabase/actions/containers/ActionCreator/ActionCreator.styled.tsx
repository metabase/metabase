import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import { space } from "metabase/styled-components/theme";

export const ActionCreatorBodyContainer = styled.div`
  display: grid;
  grid-template-columns: 4fr 3fr;
  border-top: 1px solid ${color("border")};

  .react-resizable-handle {
    display: none;
  }

  flex: 1;
  overflow-y: auto;
`;

export const EditorContainer = styled.div`
  flex: 1 1 0;
  overflow-y: auto;
  background-color: ${color("bg-light")};

  .ace_editor {
    margin-left: ${space(2)};
  }
`;

export const ModalActions = styled.div`
  display: flex;
  flex: 0 0 auto;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  border-top: 1px solid ${color("border")};
`;

export const ModalRoot = styled.div`
  display: flex;
  flex-direction: column;
  height: 90vh;
`;

export const ModalLeft = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  border-right: 1px solid ${color("border")};
`;

export const ModalRight = styled.div`
  display: flex;
  position: relative;
  overflow-y: hidden;

  ${SidebarContent.Root}, ${SidebarContent.Content} {
    width: 100%;
    height: 100%;
  }

  ${SidebarContent.Content} {
    overflow-y: auto;
  }

  ${SidebarContent.Header.Root} {
    position: sticky;
    top: 0;
    padding: 1.5rem 1.5rem 0.5rem 1.5rem;
    margin: 0;
    background-color: ${color("white")};
    z-index: 5;
  }
`;
