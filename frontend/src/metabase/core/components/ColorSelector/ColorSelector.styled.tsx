import styled from "@emotion/styled";

export interface ColorGridProps {
  colors: string[];
}

export const ColorSelectorContent = styled.div<ColorGridProps>`
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  padding: 0.75rem;
  max-width: 21.5rem;
`;
