import styled from "@emotion/styled";

import NumericInput from "metabase/components/NumericInput";
import { color } from "metabase/lib/colors";

export const IntervalInput = styled(NumericInput)`
  border-color: ${color("filter")};
`;
