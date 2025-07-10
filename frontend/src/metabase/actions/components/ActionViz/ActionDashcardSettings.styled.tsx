// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { space } from "metabase/styled-components/theme";

export const ActionSettingsHeader = styled.h2`
  font-size: 1.25rem;
  padding-bottom: 0.5rem;
`;

export const ParameterMapperContainer = styled.div`
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex: 1;
  padding-top: ${space(1)};
  padding-bottom: ${space(3)};
`;

export const ModalActions = styled.div`
  display: flex;
  flex: 0 0 auto;
  justify-content: flex-end;
  gap: 1rem;
`;
