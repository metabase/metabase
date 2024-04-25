import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
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
  color: ${color("text-dark")};
`;

export const LastRefreshTimeLabel = styled.span`
  display: block;
  font-size: 0.875rem;
  font-weight: 400;
  color: ${color("text-medium")};
  margin-top: 4px;
`;

export const IconButton = styled.button`
  display: flex;
  cursor: pointer;
`;

export const ErrorIcon = styled(Icon)`
  color: ${color("error")};
  margin-top: 1px;
  margin-left: 4px;
`;

export const RefreshIcon = styled(Icon)`
  color: ${color("text-dark")};
`;
