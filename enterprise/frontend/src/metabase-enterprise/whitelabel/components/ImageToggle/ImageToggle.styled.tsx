import styled from "@emotion/styled";

export const ToggleRoot = styled.div`
  display: flex;
  flex: 1 1 auto;
  max-width: 33rem;
  border: 1px solid var(--mb-color-border);
  border-radius: 0.5rem;
`;

export const ImageContainer = styled.div`
  display: flex;
  width: 7.5rem;
  justify-content: center;
  align-items: center;
  border-right: 1px solid var(--mb-color-border);
`;

export const ToggleContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex: 1 1 auto;
  padding: 2rem 1.5rem;
`;

export const ToggleLabel = styled.label`
  margin-right: 2rem;
`;
