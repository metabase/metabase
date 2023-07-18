import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import FieldSet from "metabase/components/FieldSet";

interface ParameterFieldSetProps {
  fieldHasValueOrFocus?: boolean;
}

export const ParameterFieldSet = styled(FieldSet)<ParameterFieldSetProps>`
  display: flex;
  align-items: center;
  transition: opacity 500ms linear;
  border: 2px solid
    ${props => (props.fieldHasValueOrFocus ? color("brand") : color("border"))};
  margin: 0.5em 0;
  padding: 0.25em 1em;
  width: 100%;

  legend {
    text-transform: none;
    position: relative;
    height: 2px;
    line-height: 0;
    margin-left: -0.45em;
    padding: 0 0.5em;
  }
`;
