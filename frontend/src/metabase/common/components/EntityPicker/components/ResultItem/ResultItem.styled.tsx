import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const ChunkyListItem = styled.button<{
  isSelected?: boolean;
  isLast?: boolean;
}>`
  padding: 1.5rem;
  cursor: pointer;
  background-color: ${({ isSelected }) =>
    isSelected ? color("brand") : "white"};
  color: ${({ isSelected }) =>
    isSelected ? color("white") : color("text-dark")};

  &:hover {
    ${({ isSelected }) =>
      !isSelected
        ? `background-color: ${color("brand-lighter")};
      color: ${color("text-dark")};`
        : ""}
  }

  ${({ isLast }) =>
    !isLast ? `border-bottom: 1px solid ${color("border")}` : ""};

  display: flex;
  gap: 1rem;
  justify-content: space-between;
  align-items: center;
  width: 100%;
`;

export const ChunkyList = styled.div`
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;
