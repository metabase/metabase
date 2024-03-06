import styled from "@emotion/styled";
import CheckBox from "metabase/core/components/CheckBox";

import { color } from "metabase/ui/utils/colors";

export const CheckboxLabel = styled(CheckBox.Label)`
  color: ${color("danger")};
  font-size: 1.12em;
`;
