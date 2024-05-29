import styled from "@emotion/styled";

export const MonospaceErrorDisplay = styled.div`
  font-family: monospace;
  white-space: pre-wrap;
  padding: 1rem;
  margin-top: 0.5rem;
  font-weight: bold;
  border-radius: 0.5rem;
  background-color: var(--mb-color-bg-light);
  border: 1px solid var(--mb-color-border);
  max-height: 16rem;
  overflow-y: auto;
`;
