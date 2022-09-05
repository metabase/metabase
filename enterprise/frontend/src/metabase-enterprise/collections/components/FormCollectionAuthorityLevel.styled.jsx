import styled from "@emotion/styled";
import CheckBox from "metabase/core/components/CheckBox";
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
