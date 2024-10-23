import styled from "@emotion/styled";

import { Icon } from "metabase/ui";

export const Row = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

export const StatusContainer = styled.div`
  display: flex;
  align-items: center;
`;

export const StatusLabel = styled.span`
  font-size: 0.875rem;
  font-weight: bold;
  color: var(--mb-color-text-dark);
`;

export const DisabledStatusLabel = styled.span`
  font-size: 0.875rem;
  color: var(--mb-color-text-light);
`;

export const LastRefreshTimeLabel = styled.span`
  display: block;
  font-size: 0.875rem;
  font-weight: 400;
  color: var(--mb-color-text-medium);
  margin-top: 4px;
`;

export const DisabledLastRefreshTimeLabel = styled(LastRefreshTimeLabel)`
  color: var(--mb-color-text-light);
`;

export const CreateOrRefreshButton = styled.button`
  display: flex;
  cursor: pointer;
  color: var(--mb-color-text-medium);
`;

export const ErrorIcon = styled(Icon)`
  color: var(--mb-color-error);
  margin-top: 1px;
  margin-left: 4px;
`;

export const RefreshIcon = styled(Icon)`
  color: var(--mb-color-text-dark);
`;
