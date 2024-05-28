import styled from "@emotion/styled";

export interface AmPmLabelProps {
  isSelected: boolean;
}

export const AmPmLabel = styled.span<AmPmLabelProps>`
  color: var(--mb-color-brand);
  font-weight: 900;
  margin-right: 0.5rem;
  cursor: pointer;
`;
