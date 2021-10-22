import styled from "styled-components";

import CheckBox from "metabase/components/CheckBox";
import { color } from "metabase/lib/colors";

export const CheckboxLabel = styled(CheckBox.Label)`
  color: ${color("danger")};
  font-size: 1.12em;
`;
