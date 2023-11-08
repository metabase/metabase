import styled from "styled-components";
import CheckBox from "metabase/components/CheckBox";
import { color } from "metabase/lib/colors";

export const FormFieldRoot = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

export const Label = styled(CheckBox.Label)`
  color: ${color("text-dark")};
  font-size: 1em;
  font-weight: bold;
  margin-bottom: 1px;
`;
