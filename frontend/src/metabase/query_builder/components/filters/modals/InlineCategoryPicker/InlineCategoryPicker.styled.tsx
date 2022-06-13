import styled from "@emotion/styled";

export const PickerContainer = styled.div`
  display: flex;
  width: 100%;
  margin: 1rem 0;
  font-weight: bold;
`;

export const PickerGrid = styled.div`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
`;
