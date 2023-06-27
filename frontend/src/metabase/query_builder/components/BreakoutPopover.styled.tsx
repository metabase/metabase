import { styled } from "metabase/ui/utils";
import { color } from "metabase/lib/colors";
import FieldList from "metabase/query_builder/components/FieldList";

export const BreakoutFieldList = styled(FieldList)`
  color: ${color("summarize")};
`;
