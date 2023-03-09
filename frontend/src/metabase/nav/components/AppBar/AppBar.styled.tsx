import styled from "@emotion/styled";

export const AppBarRoot = styled.header<{ isVisible: boolean }>`
  display: ${({ isVisible }) => (isVisible ? "block" : "none")};
  position: relative;
  z-index: 4;

  @media print {
    display: none;
  }
`;
