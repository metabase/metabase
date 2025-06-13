// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { space } from "metabase/styled-components/theme";

export const ActionSettingsWrapper = styled.div`
  display: flex;
  height: 80vh;
  overflow: hidden;
  min-width: 50rem;
  padding: 2rem;
`;

export const ActionSettingsHeader = styled.h2`
  font-size: 1.25rem;
  padding-bottom: 0.5rem;
  padding-left: 2rem;
  padding-right: 2rem;
`;

// make strolling nicer by fading out the top and bottom of the column
// eslint-disable-next-line no-color-literals
const fade = (side: "top" | "bottom") => `
  content  : "";
  position : absolute;
  z-index  : 1;
  pointer-events   : none;
  background-image : linear-gradient( to ${side},
                    rgba(255,255,255, 0),
                    rgba(255,255,255, 1) 90%);
  height   : 2rem;
`;

export const ActionSettingsLeft = styled.div`
  width: 20rem;
  overflow-y: auto;
  border-right: 1px solid var(--mb-color-border);

  &:before {
    ${fade("top")}
    top: 0;
    left: 0;
    width: 19rem;
  }

  &:after {
    ${fade("bottom")}
    bottom: 0;
    left: 0;
    width: 19rem;
  }
`;

export const ActionSettingsRight = styled.div`
  width: 30rem;
  display: flex;
  flex: 1;
  flex-direction: column;
  padding-top: ${space(3)};
`;

export const ParameterMapperContainer = styled.div`
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex: 1;
  padding-top: ${space(1)};
  padding-bottom: ${space(3)};
  padding-left: ${space(3)};
  padding-right: ${space(3)};
`;

export const ModalActions = styled.div`
  display: flex;
  flex: 0 0 auto;
  justify-content: flex-end;
  gap: 1rem;
  padding: 1rem 1rem 0;
  border-top: 1px solid var(--mb-color-border);
`;
