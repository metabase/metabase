import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export interface BadgeProps {
  isValid?: boolean;
}

const getColor = ({ isValid }: BadgeProps): string => {
  return color(isValid ? "success" : "error");
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
