import { css } from "@emotion/react";
import styled from "@emotion/styled";

import CollapseSection from "metabase/components/CollapseSection";
import UnstyledEmptyState from "metabase/components/EmptyState";
import Button from "metabase/core/components/Button";
import { alpha } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const ModelCollapseSection = styled(CollapseSection)`
  margin-bottom: ${space(1)};
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
  border-radius: ${space(0)};
  cursor: pointer;

  ${({ isSelected, theme }) =>
    isSelected &&
    css`
      background-color: ${alpha(theme.fn.themeColor("brand"), 0.2)};
    `}

  &:hover {
    background-color: ${() => alpha("brand", 0.35)};
  }
`;

export const EmptyState = styled(UnstyledEmptyState)`
  margin-bottom: ${space(2)};
`;

export const EmptyModelStateContainer = styled.div`
  padding: ${space(2)};
  color: var(--mb-color-text-medium);
  text-align: center;
`;

export const EditButton = styled(Button)`
  color: var(--mb-color-text-light);
  padding: 0 0.5rem;
`;

export const NewActionButton = styled(Button)`
  margin: 0.25rem 0.75rem;
`;
