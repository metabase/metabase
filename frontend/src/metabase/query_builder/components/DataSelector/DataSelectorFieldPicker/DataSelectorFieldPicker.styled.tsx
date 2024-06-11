import styled from "@emotion/styled";

import { space } from "metabase/styled-components/theme";

export const Container = styled.div`
  overflow-y: auto;
  width: 300px;
`;

export const HeaderContainer = styled.div`
  align-items: center;
  color: var(--mb-color-text-medium);
  cursor: pointer;
  display: flex;
`;

export const HeaderName = styled.span`
  margin-left: ${space(1)};
  overflow-wrap: anywhere;
  word-break: break-word;
  word-wrap: anywhere;
`;
