import styled from "@emotion/styled";

export const QueryBuilderViewRoot = styled.div`
  display: flex;
  flex-direction: column;
  background-color: var(--mb-color-bg-white);
  height: 100%;
  position: relative;
`;

export const QueryBuilderContentContainer = styled.div`
  display: flex;
  flex: 1 0 auto;
  position: relative;

  @media screen and (max-width: 40em) {
    justify-content: end;
  }
`;
