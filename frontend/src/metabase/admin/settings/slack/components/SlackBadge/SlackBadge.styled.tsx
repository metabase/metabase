import type { Theme } from "@emotion/react";
import styled from "@emotion/styled";

export interface BadgeProps {
  isValid?: boolean;
}

const getColor = ({
  isValid,
  theme,
}: BadgeProps & { theme: Theme }): string => {
  return theme.fn.themeColor(isValid ? "success" : "error");
};

export const BadgeRoot = styled.span`
  display: inline-flex;
  align-items: center;
`;

export const BadgeIcon = styled.span<BadgeProps>`
  width: 0.75rem;
  height: 0.75rem;
  margin-right: 0.5rem;
  border-radius: 50%;
  background-color: ${getColor};
`;

export const BadgeText = styled.span<BadgeProps>`
  color: ${getColor};
  font-weight: bold;
`;
