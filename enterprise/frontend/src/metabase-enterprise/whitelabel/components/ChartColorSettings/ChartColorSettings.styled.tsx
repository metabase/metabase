import styled from "@emotion/styled";

import { breakpointMinLarge } from "metabase/styled-components/theme";

export const TableBody = styled.div`
  border: 1px solid var(--mb-color-border);
  border-bottom: 0;
  border-radius: 0.5rem 0.5rem 0 0;

  ${breakpointMinLarge} {
    border-top-right-radius: 0;
  }
`;

export const TableBodyRow = styled.div`
  display: flex;
  align-items: center;

  &:not(:first-of-type) {
    border-top: 1px solid var(--mb-color-border);
  }
`;

export const TableBodyCell = styled.div`
  flex: 1 1 auto;
  width: 12rem;
  padding: 1rem 1.5rem;

  &:not(:first-of-type) {
    border-left: 1px solid var(--mb-color-border);
    background-color: var(--mb-color-bg-light);
  }

  ${breakpointMinLarge} {
    flex-grow: 0;
  }
`;

export const TableFooter = styled.div`
  padding: 1rem 1.5rem;
  border: 1px solid var(--mb-color-border);
  border-radius: 0 0 0.5rem 0.5rem;

  ${breakpointMinLarge} {
    border-bottom-right-radius: 0;
  }
`;
