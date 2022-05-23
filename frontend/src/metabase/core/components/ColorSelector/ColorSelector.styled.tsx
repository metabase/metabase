import styled from "@emotion/styled";

export interface ColorSelectorProps {
  colors: string[];
}

export const ColorSelectorRoot = styled.div<ColorSelectorProps>`
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  padding: 0.75rem;
  max-width: 21.5rem;
`;
