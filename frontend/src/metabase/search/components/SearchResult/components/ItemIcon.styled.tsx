import styled from "@emotion/styled";

import { color, lighten } from "metabase/lib/colors";
import type { SearchModel } from "metabase-types/api";

function getColorForIconWrapper(
  active: boolean,
  archived: boolean,
  type: SearchModel,
) {
  if (!active || archived) {
    return color("text-medium");
  }
  if (type === "collection") {
    return lighten("brand", 0.35);
  }
  return color("brand");
}

export const IconWrapper = styled.div<{
  active: boolean;
  archived: boolean;
  type: SearchModel;
}>`
  border: 1px solid var(--mb-color-border);
  border-radius: ${({ theme }) => theme.radius.sm};
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  color: ${({ active, archived, type }) =>
    getColorForIconWrapper(active, archived, type)};
  flex-shrink: 0;
  background: var(--mb-color-bg-white);
`;
