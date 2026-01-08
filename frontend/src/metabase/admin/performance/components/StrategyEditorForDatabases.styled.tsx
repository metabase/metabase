// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const Panel = styled.section<{ hasLeftBorder?: boolean }>`
  overflow-y: auto;
  background-color: var(--mb-color-background-primary);
  height: 100%;

  ${(props) =>
    props.hasLeftBorder &&
    css`
      border-left: 1px solid var(--mb-color-border);
    `}
`;

export const RoundedBox = styled.div<{ twoColumns?: boolean }>`
  margin-bottom: 1rem;
  width: 100%;
  display: grid;
  grid-template-columns: minmax(5rem, 30rem) ${(props) =>
      props.twoColumns ? "minmax(5rem, auto)" : ""};
  max-width: ${(props) => (props.twoColumns ? "100%" : "30rem")};
  overflow: hidden;
  border-radius: 1rem;
  border: 2px solid var(--mb-color-border);
`;
