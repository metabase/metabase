import { styled } from "metabase/ui/utils";
import AccordionList from "metabase/core/components/AccordionList";
import { color } from "metabase/lib/colors";
import FieldList from "../FieldList";

export const AggregationItemList = styled(AccordionList)`
  color: ${color("summarize")};
`;

export const AggregationFieldList = styled(FieldList)`
  color: ${color("summarize")};
`;
