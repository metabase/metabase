import styled from "@emotion/styled";

export const ItemName = styled.span`
  color: var(--mb-color-brand);
`;

export const ColumnClickBehaviorHeader = styled.div`
  display: flex;
  align-items: center;
  cursor: pointer;

  &:hover {
    color: var(--mb-color-brand);
  }
`;

export const ChevronIconContainer = styled.div`
  padding: 4px 6px;
  margin-right: 8px;

  border: 1px solid var(--mb-color-border);
  border-radius: 4px;
`;
