import { styled } from "metabase/ui/utils";
import QueryColumnPicker from "metabase/common/components/QueryColumnPicker";
import { color } from "metabase/lib/colors";

export const BreakoutColumnPicker = styled(QueryColumnPicker)`
  color: ${color("summarize")};
`;
