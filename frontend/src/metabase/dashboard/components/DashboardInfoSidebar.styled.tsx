import styled from "@emotion/styled";
import EditableText from "metabase/core/components/EditableText";

import { color } from "metabase/lib/colors";

export const DashboardInfoSidebarRoot = styled.div`
  width: 360px;
  padding: 1.5rem 2rem;
  background: ${color("white")};
  border-left: 1px solid ${color("border")};
  height: 100%;
  overflow-y: auto;
`;

export const HistoryHeader = styled.h3`
  margin-bottom: 1rem;
`;

export const DashboardDescriptionEditbaleText = styled(EditableText)`
  margin-bottom: 2rem;
`;
