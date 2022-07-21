import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import EditableText from "metabase/core/components/EditableText";

export const DashboardInfoSidebarRoot = styled.div`
  width: 360px;
  padding: 0 2rem 0.5rem;
  background: ${color("white")};
  border-left: 1px solid ${color("border")};
  align-self: stretch
  overflow-y: auto;
`;

export const HistoryHeader = styled.h3`
  margin-bottom: 1rem;
`;

export const ContentSection = styled.div`
  padding: 2rem 0;
  border-bottom: 1px solid ${color("border")};

  &:first-of-type {
    padding-top: 1.5rem;
  }

  &:last-of-type {
    border-bottom: none;
  }

  ${EditableText.Root} {
    font-size: 1rem;
    line-height: 1.4rem;
    margin-left: -0.3rem;
  }
`;

export const DescriptionHeader = styled.h3`
  margin-bottom: 0.5rem;
`;
