import styled from "@emotion/styled";
import { Button } from "metabase/ui";
import type { ButtonProps } from "metabase/ui";

interface TabButtonProps extends ButtonProps {
  isSelected?: boolean;
  onClick?: () => void;
}

export const TabButton = styled(Button)<TabButtonProps>`
  border-bottom: 1px solid
    ${({ theme, isSelected }) =>
      isSelected ? theme.colors.brand[1] : "transparent"};

  &:hover {
    border-bottom-color: ${({ theme }) => theme.colors.brand[1]};
  }
`;

TabButton.defaultProps = {
  c: "text.2",
  pl: 0,
  pr: 0,
  radius: 0,
  variant: "subtle",
};
