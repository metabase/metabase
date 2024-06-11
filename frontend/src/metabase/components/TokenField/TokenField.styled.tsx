import styled from "@emotion/styled";

import { space } from "metabase/styled-components/theme";

export const TokenFieldContainer = styled.ul`
  display: flex;
  flex-wrap: wrap;
  padding: ${space(0)};
  gap: ${space(0)};
  font-weight: bold;
  cursor: pointer;

  max-height: 130px;

  background-color: var(--mb-color-bg-white);
  overflow-x: auto;
  overflow-y: auto;
  border-radius: ${space(1)};
  border: 1px solid var(--mb-color-border);
`;

export const TokenInputItem = styled.li`
  display: flex;
  flex: 1 0 auto;
  align-items: center;
  margin-right: 0.5rem;
  height: 46px;
`;

export const PrefixContainer = styled.div`
  display: flex;
  align-items: center;
  color: var(--mb-color-text-medium);
`;
