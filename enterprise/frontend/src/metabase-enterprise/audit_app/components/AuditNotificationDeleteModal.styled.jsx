import styled from "styled-components";
import { color } from "metabase/lib/colors";
import CheckBox from "metabase/components/CheckBox";

export const CheckboxLabel = styled(CheckBox.Label)`
  color: ${color("danger")};
  font-size: 1.12em;
`;
