import styled, { css } from "styled-components";
import { color } from "metabase/lib/colors";
import NumericInput from "metabase/components/NumericInput";

export const CacheTTLFieldContainer = styled.div`
  display: flex;
  align-items: center;
`;

export const FieldText = styled.span`
  color: ${color("text-dark")};
  ${props => css`margin-${props.margin}: 10px;`}
`;

export const Input = styled(NumericInput)`
  width: 50px;
  text-align: center;

  color: ${color("text-dark")};
  font-weight: bold;
  padding: 0.75em;

  border: 1px solid ${color("border")};
  border-radius: 4px;
  outline: none;

  :focus,
  :hover {
    border-color: ${color("brand")};
  }

  transition: border 300ms ease-in-out;
`;
