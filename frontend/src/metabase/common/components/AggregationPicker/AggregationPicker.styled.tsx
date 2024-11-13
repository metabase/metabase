import styled from "@emotion/styled";

export const ColumnPickerHeaderContainer = styled.div`
  display: flex;
  align-items: center;
  padding: 1rem 0.5rem;
  border-bottom: 1px solid var(--mb-color-border);
  color: var(--mb-color-text-medium);
`;

export const ColumnPickerHeaderTitleContainer = styled.a`
  display: flex;
  align-items: center;
  cursor: pointer;
  gap: 0.5rem;
`;

export const ColumnPickerHeaderTitle = styled.span`
  display: inline-block;
  font-weight: 700;
  font-size: 1.17em;
`;
