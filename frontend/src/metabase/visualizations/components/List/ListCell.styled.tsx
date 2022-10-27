import styled from "@emotion/styled";

export const CellContent = styled.span<{ isClickable: boolean }>`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  img {
    border-radius: 99px;
    height: 36px !important;
  }
`;
