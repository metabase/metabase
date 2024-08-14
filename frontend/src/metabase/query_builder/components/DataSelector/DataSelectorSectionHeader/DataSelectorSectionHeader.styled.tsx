import styled from "@emotion/styled";

import { space } from "metabase/styled-components/theme";

export const DataSelectorSectionHeaderContainer = styled.div`
  align-items: center;
  border-bottom: 1px solid var(--mb-color-border);
  display: flex;
  padding: ${space(2)};
`;

export const DataSelectorSectionHeading = styled.h3`
  color: var(--mb-color-text-dark);
`;
