import styled from "@emotion/styled";

interface PopoverRootProps {
  noTopPadding: boolean;
}

export const PopoverRoot = styled.div<PopoverRootProps>`
  overflow-y: auto;
  max-height: 600px;
  min-width: 336px;

  ${({ noTopPadding }) => noTopPadding && "padding-top: 0;"}
`;
