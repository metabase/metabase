// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { focusOutlineStyle } from "metabase/common/style/input";
import { alpha } from "metabase/lib/colors";
import { Icon } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";

interface TabProps {
  isSelected?: boolean;
}

export const TabRoot = styled.button<TabProps>`
  display: flex;
  align-items: end;
  width: 100%;
  flex: 1;
  text-align: left;
  color: ${(props) =>
    props.isSelected ? color("brand") : color("text-primary")};
  background-color: ${(props) =>
    props.isSelected ? alpha("brand", 0.1) : "transparent"};
  cursor: pointer;
  margin-bottom: 0.75rem;
  padding: 0.75rem 1rem;
  margin-right: var(--mantine-spacing-sm);
  border-radius: var(--mantine-spacing-xs);

  &:hover {
    color: var(--mb-color-brand);
  }

  ${focusOutlineStyle("brand")};
`;

export const TabIcon = styled(Icon)`
  width: 1rem;
  height: 1rem;
  margin-right: 0.5rem;
`;

export const TabLabel = styled.div`
  width: 100%;
  font-weight: bold;
  overflow: hidden;
  text-overflow: ellipsis;
`;
