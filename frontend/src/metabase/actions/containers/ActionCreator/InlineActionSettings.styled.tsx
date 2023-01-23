import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

import SidebarContent from "metabase/query_builder/components/SidebarContent";
import { space } from "metabase/styled-components/theme";

export const ActionSettingsContainer = styled.div`
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

export const ToggleContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

export const ToggleLabel = styled.label`
  font-size: 0.875rem;
  color: ${color("text-medium")};
  font-weight: 700;
  margin-right: ${space(1)};
`;

export const CopyWidgetContainer = styled.div`
  margin-top: ${space(2)};
`;
