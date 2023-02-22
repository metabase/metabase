import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

import SidebarContent from "metabase/query_builder/components/SidebarContent";

export const ActionSettingsContainer = styled.div`
  width: 100%;

  ${SidebarContent.Header.Root} {
    position: sticky;
    top: 0;
    padding: 1.5rem 1.5rem 0.5rem 1.5rem;
    margin: 0;
    background-color: ${color("white")};
  }
`;

export const ActionSettingsContent = styled.div`
  margin: 1rem 1.5rem;
`;

export const CopyWidgetContainer = styled.div`
  margin-bottom: 1.25rem;
`;
