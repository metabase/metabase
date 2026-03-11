// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Button } from "metabase/common/components/Button";
import { CollapseSection } from "metabase/common/components/CollapseSection";
import { EmptyState as UnstyledEmptyState } from "metabase/common/components/EmptyState";

export const ModelCollapseSection = styled(CollapseSection)`
  margin-bottom: var(--mantine-spacing-sm);
`;

export const ActionsList = styled.ul`
  list-style: none;
  padding: 0.5rem 1rem;
`;

export const ActionItem = styled.li<{ isSelected?: boolean }>`
  display: flex;
  font-weight: bold;
  color: var(--mb-color-brand);
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  margin-bottom: 1px;
  border-radius: var(--mantine-spacing-xs);
  cursor: pointer;

  ${({ isSelected }) =>
    isSelected &&
    css`
      background-color: var(--mb-color-background-brand);
    `}

  &:hover {
    background-color: var(--mb-color-background-hover);
  }
`;

export const EmptyState = styled(UnstyledEmptyState)`
  margin-bottom: var(--mantine-spacing-md);
`;

export const EmptyModelStateContainer = styled.div`
  padding: var(--mantine-spacing-md);
  color: var(--mb-color-text-secondary);
  text-align: center;
`;

export const EditButton = styled(Button)`
  color: var(--mb-color-text-tertiary);
  padding: 0 0.5rem;
`;

export const NewActionButton = styled(Button)`
  margin: 0.25rem 0.75rem;
`;
