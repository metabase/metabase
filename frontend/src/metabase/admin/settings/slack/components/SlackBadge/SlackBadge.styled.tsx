import styled from "styled-components";
import { color } from "metabase/lib/colors";

export interface BadgeProps {
  isError?: boolean;
}

const getColor = ({ isError }: BadgeProps): string => {
  return color(isError ? "error" : "success");
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
