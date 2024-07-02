import styled from "@emotion/styled";

import { Icon } from "metabase/ui";

export const NotificationCardRoot = styled.div`
  display: flex;
  align-items: center;
  padding: 1rem 1.5rem;
  border: 1px solid var(--mb-color-border);
  border-radius: 6px;
  background-color: var(--mb-color-bg-white);

  &:not(:last-child) {
    margin-bottom: 1.25rem;
  }
`;

export const NotificationContent = styled.div`
  flex: 1 1 auto;
`;

export const NotificationDescription = styled.div`
  display: flex;
  flex-wrap: wrap;
  margin-top: 0.25rem;
`;

export const NotificationMessage = styled.span`
  color: var(--mb-color-text-medium);
  font-size: 0.75rem;
  line-height: 0.875rem;

  &:not(:last-child)::after {
    content: " · ";
    white-space: pre;
  }
`;

export const NotificationIcon = styled(Icon)`
  color: var(--mb-color-text-light);
  cursor: pointer;
  width: 1rem;
  height: 1rem;

  &:hover {
    color: var(--mb-color-text-medium);
  }
`;
