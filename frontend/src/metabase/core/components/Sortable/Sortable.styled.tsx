import styled from "@emotion/styled";

export const SortableDiv = styled.div<{
  transform: string | undefined;
  transition: string | undefined;
  isDragging: boolean;
}>`
  transform: ${props => props.transform};
  transition: ${props => props.transition};
  ${({ isDragging }) => (isDragging ? "z-index: 10;" : "")}
`;
