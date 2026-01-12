// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Icon } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";

export const NoticeRoot = styled.div`
  display: flex;
  padding: 1rem 1rem 1rem 1.5rem;
  align-items: center;
  background-color: var(--mb-color-background-secondary);
`;

export const NoticeContent = styled.div`
  flex: 1 1 auto;
  margin: 0 0.75rem;
  color: var(--mb-color-text-primary);
`;

export const NoticeWarningIcon = styled(Icon)`
  color: ${() => color("accent5")};
  width: 1.5rem;
  height: 1.5rem;
`;

export const NoticeCloseIcon = styled(Icon)`
  color: var(--mb-color-background-tertiary-inverse);
  cursor: pointer;

  &:hover {
    color: ${() => color("admin-navbar")};
  }
`;
