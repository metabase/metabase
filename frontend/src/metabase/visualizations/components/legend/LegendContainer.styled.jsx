import styled from "styled-components";

export const LegendContainerRoot = styled.div`
  display: flex;
  min-height: 0;
  padding: 0 1rem 1rem;
`;

export const LegendPanel = styled.div`
  width: 25%;
  min-width: 4rem;
  max-width: 20rem;
  overflow-y: auto;
`;

export const LegendContent = styled.div`
  flex: 1 1 auto;
  position: relative;
`;
