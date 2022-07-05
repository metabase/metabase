import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const DashboardInfoSidebarRoot = styled.div`
  width: 360px;
  padding: 0.5rem 2rem;
  background: ${color("white")};
  border-left: 1px solid ${color("border")};
  height: 100%;
  overflow-y: auto;
`;

export const HistoryHeader = styled.h3`
  margin-bottom: 1rem;
`;

export const ContentSection = styled.div`
  padding: 2rem 0;
  border-bottom: 1px solid ${color("border")};

  &:last-of-type {
    border-bottom: none;
  }
`;
