import styled from "@emotion/styled";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { color } from "metabase/lib/colors";

interface SqlButtonProps {
  isSelected?: boolean;
}

export const SqlButton = styled(IconButtonWrapper)<SqlButtonProps>`
  color: ${({ isSelected }) =>
    isSelected ? color("text-white") : color("text-dark")};
  background-color: ${({ isSelected }) => isSelected && color("brand")};
  height: 2rem;
  width: 2rem;

  &:hover {
    color: var(--mb-color-brand);
    background-color: var(--mb-color-bg-medium);
    border: 1px solid var(--mb-color-brand);
    transition: all 200ms linear;
  }
`;
