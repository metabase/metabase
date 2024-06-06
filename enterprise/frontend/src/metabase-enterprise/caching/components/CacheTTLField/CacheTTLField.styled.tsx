import { css } from "@emotion/react";
import styled from "@emotion/styled";

import NumericInput from "metabase/components/NumericInput";
import { color } from "metabase/lib/colors";

export const CacheTTLFieldContainer = styled.div`
  display: flex;
  align-items: center;
`;

export const FieldText = styled.span<{ hasError?: boolean; margin: string }>`
  color: ${props => (props.hasError ? color("error") : color("text-dark"))};
  ${props => css`margin-${props.margin}: 10px;`}
`;

export const Input = styled(NumericInput)`
  width: 50px;
  text-align: center;

  color: ${props => (props.hasError ? color("error") : color("text-dark"))};
  font-weight: bold;
  padding: 0.75em;

  border: 1px solid var(--mb-color-border);
  border-radius: 4px;
  outline: none;

  :focus,
  :hover {
    border-color: var(--mb-color-brand);
  }

  transition: border 300ms ease-in-out;
`;
