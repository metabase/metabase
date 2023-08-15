import styled from "@emotion/styled";
import FieldSet from "metabase/components/FieldSet";
import { color } from "metabase/lib/colors";

export const StyledFieldSet = styled(FieldSet)`
  display: flex;
  align-items: center;
  transition: opacity 500ms linear;
  border: 2px solid ${color("border")};
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

  @media screen and (min-width: 440px) {
    margin-right: 0.85em;
    width: auto;
  }
`;
