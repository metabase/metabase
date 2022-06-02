import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import NumericInput from "metabase/core/components/NumericInput";
import Input from "metabase/core/components/Input";

export const CompactInputContainer = styled.div`
  display: flex;
  align-items: center;
  padding: 0.55rem 1rem;

  border-radius: 8px;
  border: 1px solid ${color("border")};
  background-color: ${color("white")};
`;

export const CompactInput = styled(NumericInput)`
  width: 1rem;
  text-align: center;

  ${Input.Root}, ${Input.Field} {
    border: none;
    padding: 0;
    margin: 0;

    font-size: 0.875rem;
  }
`;
