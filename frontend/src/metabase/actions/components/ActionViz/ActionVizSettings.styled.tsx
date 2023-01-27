import styled from "@emotion/styled";

import { space } from "metabase/styled-components/theme";
import { color } from "metabase/lib/colors";

export const ActionSettingsWrapper = styled.div`
  display: flex;
  height: 80vh;
  overflow: hidden;
`;

export const ActionSettingsHeader = styled.h2`
  font-size: 1.25rem;
  padding-bottom: ${space(1)};
  padding-left: ${space(3)};
`;

export const ActionSettingsLeft = styled.div`
  padding-left: ${space(3)};
  padding-top: ${space(3)};
  width: 20rem;
  overflow-y: auto;
`;

export const ActionSettingsRight = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  padding-top: ${space(3)};
  border-left: 1px solid ${color("border")};
`;

export const ParameterMapperContainer = styled.div`
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex: 1;
  padding-left: ${space(3)};
`;

export const ModalActions = styled.div`
  display: flex;
  flex: 0 0 auto;
  justify-content: flex-end;
  gap: 1rem;
  padding: 1rem;
  border-top: 1px solid ${color("border")};
`;
