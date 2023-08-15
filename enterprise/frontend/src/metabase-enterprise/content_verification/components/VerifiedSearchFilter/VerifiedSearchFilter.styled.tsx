import styled from "@emotion/styled";
import Button from "metabase/core/components/Button";
import { color, lighten } from "metabase/lib/colors";

export const VerifiedFilterButton = styled(Button)<{ isSelected: boolean }>`
  ${({ isSelected }) =>
    isSelected
      ? `
      &, &:hover {
        background-color: ${lighten("brand", 0.6)};
        color: ${color("brand")};
        border-color: ${lighten("brand", 0.6)};
      }
    `
      : ""}
`;
