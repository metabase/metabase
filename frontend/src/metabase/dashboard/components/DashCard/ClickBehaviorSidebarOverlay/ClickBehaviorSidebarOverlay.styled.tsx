import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const Root = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
`;

export const Button = styled.button<{ isActive: boolean }>`
  display: flex;
  padding: 0.5rem 1rem;
  margin-bottom: 1rem;
  border-radius: 8px;
  font-weight: bold;
  cursor: pointer;
  background-color: ${({ isActive }) =>
    isActive ? color("brand") : color("bg-light")};
  color: ${({ isActive }) =>
    isActive ? color("text-white") : color("text-medium")};
`;

export const ClickIcon = styled(Icon)<{ isActive: boolean }>`
  margin-right: 0.5rem;
  color: ${({ isActive }) => (!isActive ? color("text-light") : "unset")};
`;

export const HelperText = styled.span`
  display: block;
  margin-right: 1rem;
`;

export const ClickBehaviorDescription = styled.span<{ isActive: boolean }>`
  display: block;
  color: ${({ isActive }) => (!isActive ? color("brand") : "unset")};
`;
