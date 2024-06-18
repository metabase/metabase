import styled from "@emotion/styled";

import { darken } from "metabase/lib/colors";
import { breakpointMinLarge } from "metabase/styled-components/theme";

export const TableHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border: 1px solid var(--mb-color-border);
  border-radius: 0.5rem 0.5rem 0 0;

  ${breakpointMinLarge} {
    border-top-right-radius: 0;
  }
`;

export const TableTitle = styled.div`
  color: var(--mb-color-text-dark);
  font-size: 1rem;
  font-weight: bold;
`;

export const TableLink = styled.div`
  display: inline-block;
  color: var(--mb-color-brand);
  font-weight: bold;
  cursor: pointer;

  &:hover {
    color: ${() => darken("brand", 0.12)};
  }
`;

export const TableBody = styled.div`
  border: 1px solid var(--mb-color-border);
  border-top: none;
  border-bottom: 0;
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
