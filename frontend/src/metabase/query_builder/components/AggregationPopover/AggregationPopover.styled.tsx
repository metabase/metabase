import styled from "@emotion/styled";
import AccordionList from "metabase/core/components/AccordionList";
import { color } from "metabase/lib/colors";
import FieldList from "../FieldList";

export const AggregationItemList = styled(AccordionList)`
  color: ${color("summarize")};
`;

export const AggregationFieldList = styled(FieldList)`
  color: ${color("summarize")};
`;

export const AggregationMetricItemTooltip = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  flex: 1;
  padding: 0.5rem;
`;
