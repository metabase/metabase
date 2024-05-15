import styled from "@emotion/styled";

import { color, lighten } from "metabase/lib/colors";
import type { SearchModel } from "metabase-types/api";

function getColorForIconWrapper({
  active,
  type,
}: {
  active: boolean;
  type: SearchModel;
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
  type: SearchModel;
}>`
  border: ${({ theme }) => `1px solid ${theme.fn.themeColor("border")}`};
  border-radius: ${({ theme }) => theme.radius.sm};
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  color: ${({ active, type }) => getColorForIconWrapper({ active, type })};
  flex-shrink: 0;
  background: ${color("white")};
`;
