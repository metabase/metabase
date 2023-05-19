import styled from "@emotion/styled";
import { AggregationPicker as BaseAggregationPicker } from "metabase/common/components/AggregationPicker";
import { color } from "metabase/lib/colors";

export const AggregationPicker = styled(BaseAggregationPicker)`
  color: ${color("summarize")};
`;
