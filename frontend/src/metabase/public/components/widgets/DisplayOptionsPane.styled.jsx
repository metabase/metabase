import styled from "@emotion/styled";
import { space } from "metabase/styled-components/theme";

export const StyleContainer = styled.div`
  display: flex;
  & > * {
    flex-grow: 1;
  }
`;

export const DisplayOption = styled.div`
  margin-bottom: 1rem;
  padding-bottom: 1.5rem;

  &:last-child {
    padding-bottom: 0;
  }
`;
export const DisplayOptionTitle = styled.h3`
  margin-bottom: 1rem;
`;

export const ToggleContainer = styled.div`
  display: flex;
  align-items: center;
`;

export const ToggleLabel = styled.label`
  margin-right: ${space(3)};
  line-height: 1.5;
`;
