import styled from "@emotion/styled";
import type { SearchModelType } from "metabase-types/api";
import { color, lighten } from "metabase/lib/colors";

function getColorForIconWrapper({
  active,
  type,
}: {
  active: boolean;
  type: SearchModelType;
}) {
  if (!active) {
    return color("text-medium");
  }
  if (type === "collection") {
    return lighten("brand", 0.35);
  }
  return color("brand");
}

export const IconWrapper = styled.div<{
  active: boolean;
  type: SearchModelType;
}>`
  border: ${({ theme }) => `1px solid ${theme.colors.border[0]}`};
  border-radius: ${({ theme }) => theme.radius.sm};
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  color: ${({ active, type }) => getColorForIconWrapper({ active, type })};
  //margin-right: 10px;
  flex-shrink: 0;
`;
