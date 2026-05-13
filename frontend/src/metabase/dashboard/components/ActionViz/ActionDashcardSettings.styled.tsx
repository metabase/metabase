// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const ActionSettingsWrapper = styled.div`
  display: flex;
  height: 80vh;
  overflow: hidden;
  min-width: 50rem;
`;

export const ActionSettingsHeader = styled.h2`
  font-size: 1.25rem;
  padding-bottom: var(--mantine-spacing-sm);
  padding-left: var(--mantine-spacing-xl);
  padding-right: var(--mantine-spacing-xl);
`;

// make strolling nicer by fading out the top and bottom of the column
const fade = (side: "top" | "bottom") => `
  content  : "";
  position : absolute;
  z-index  : 1;
  pointer-events   : none;
  background-image : linear-gradient( to ${side},
                    transparent,
                    var(--mb-color-background-primary) 90%);
  height   : 2rem;
`;

export const ActionSettingsLeft = styled.div`
  padding-left: var(--mantine-spacing-xl);
  padding-top: var(--mantine-spacing-xl);
  padding-bottom: var(--mantine-spacing-xl);
  width: 20rem;
  overflow-y: auto;

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
  max-width: 30rem;
  display: flex;
  flex: 1;
  flex-direction: column;
  padding-top: var(--mantine-spacing-xl);
  border-left: 1px solid var(--mb-color-border);
`;

export const ParameterMapperContainer = styled.div`
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex: 1;
  padding-top: var(--mantine-spacing-sm);
  padding-bottom: var(--mantine-spacing-xl);
  padding-left: var(--mantine-spacing-xl);
  padding-right: var(--mantine-spacing-xl);
`;

export const ModalActions = styled.div`
  display: flex;
  flex: 0 0 auto;
  justify-content: flex-end;
  gap: 1rem;
  padding: 1rem;
  border-top: 1px solid var(--mb-color-border);
`;
