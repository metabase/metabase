import styled from "@emotion/styled";

import { AggregationPicker as BaseAggregationPicker } from "metabase/common/components/AggregationPicker";
import { color } from "metabase/lib/colors";
import SidebarContent from "metabase/query_builder/components/SidebarContent";

export const SidebarView = styled(SidebarContent)`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
`;

const Section = styled.section`
  padding: 1.5rem;
`;

export const SectionTitle = styled.h3`
  font-weight: 900;
  margin-bottom: 1rem;
`;

export const AggregationsContainer = styled(Section)`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding-top: 0;
`;

export const AggregationPicker = styled(BaseAggregationPicker)`
  color: ${color("summarize")};
`;

export const ColumnListContainer = styled(Section)`
  border-top: 1px solid ${color("border")};
`;
