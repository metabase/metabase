import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import NumericInput from "metabase/components/NumericInput";

export const IntervalInput = styled(NumericInput)`
  border-color: ${color("filter")};
`;
