import styled from "@emotion/styled";

export const CopyButtonContainer = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  cursor: pointer;
  z-index: 2;

  &:hover {
    color: ${({ theme }) => theme.fn.themeColor("brand")};
  }
`;
