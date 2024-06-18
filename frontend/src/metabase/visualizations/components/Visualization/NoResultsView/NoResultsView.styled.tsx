import styled from "@emotion/styled";

export const Root = styled.div`
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;

  padding-left: 0.5rem;
  padding-right: 0.5rem;
  padding-bottom: 0.5rem;

  color: var(--mb-color-text-light);
`;

export const ShortMessage = styled.span`
  font-weight: bold;
  font-size: 1.12em;
`;
