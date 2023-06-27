import { styled } from "metabase/ui/utils";
import { color } from "metabase/lib/colors";
import NumericInput from "metabase/components/NumericInput";

export const IntervalInput = styled(NumericInput)`
  border-color: ${color("filter")};
`;
