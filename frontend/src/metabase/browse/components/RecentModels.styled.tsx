import styled from "@emotion/styled";

export const RecentModelsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, calc(25% - 0.375rem));

  @container ItemsTableContainer (max-width: 824px) {
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  }

  gap: 0.5rem;
  margin: 0;
  width: 100%;
  margin-bottom: 0.5rem;
`;
