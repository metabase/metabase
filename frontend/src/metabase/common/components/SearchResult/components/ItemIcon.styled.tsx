// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { lighten } from "metabase/ui/colors";
import { color } from "metabase/ui/utils/colors";
import type { SearchModel } from "metabase-types/api";

function getColorForIconWrapper(
  active: boolean,
  archived: boolean,
  type: SearchModel,
) {
  if (!active || archived) {
    return color("text-secondary");
  }
  if (type === "collection") {
    return lighten("core-brand", 0.35);
  }
  return color("core-brand");
}

export const IconWrapper = styled.div<{
  active: boolean;
  archived: boolean;
  type: SearchModel;
}>`
  border: 1px solid var(--mb-color-border-neutral);
  border-radius: ${({ theme }) => theme.radius.sm};
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  color: ${({ active, archived, type }) =>
    getColorForIconWrapper(active, archived, type)};
  flex-shrink: 0;
  background: var(--mb-color-background_page-primary);
`;
