import styled from "@emotion/styled";

import LoadingSpinner from "metabase/components/LoadingSpinner";
import { color, lighten } from "metabase/lib/colors";
import { Icon } from "metabase/ui";
import type { InitialSyncStatus } from "metabase-types/api";

interface Props {
  status: InitialSyncStatus;
}

const getIconColor = ({ status }: Props): string => {
  switch (status) {
    case "incomplete":
      return color("brand");
    default:
      return color("white");
  }
};

const getIconSize = ({ status }: Props): string => {
  switch (status) {
    case "incomplete":
      return "0.875rem";
    default:
      return "0.75rem";
  }
};

const getBorderColor = ({ status }: Props): string => {
  switch (status) {
    case "complete":
      return color("brand");
    default:
      return lighten("brand", 0.5);
  }
};

const getBackgroundColor = ({ status }: Props): string => {
  switch (status) {
    case "incomplete":
      return "transparent";
    case "complete":
      return color("success");
    case "aborted":
      return color("error");
  }
};

export const StatusRoot = styled.div`
  position: relative;
  width: 3rem;
  height: 3rem;
  cursor: pointer;
`;

export const StatusContainer = styled.div<Props>`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  color: ${getIconColor};
  border: 0.25rem solid ${getBorderColor};
  border-radius: 50%;
  background-color: ${lighten("brand", 0.6)};
  box-shadow: 0 1px 12px ${color("shadow")};
`;

export const StatusIconContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  background-color: ${getBackgroundColor};
`;

export const StatusIcon = styled(Icon)`
  width: ${getIconSize};
  height: ${getIconSize};
`;

export const StatusSpinner = styled(LoadingSpinner)`
  position: absolute;
  top: 0;
  left: 0;
  color: ${color("brand")};
`;
