import styled from "@emotion/styled";

export interface ColorListProps {
  colors: string[];
}

export const ColorList = styled.div<ColorListProps>`
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  padding: 0.75rem;
  max-width: 21.5rem;
`;
