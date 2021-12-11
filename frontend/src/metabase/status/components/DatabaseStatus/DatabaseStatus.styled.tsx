import styled from "styled-components";
import { color, lighten } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import { InitialSyncStatus } from "../../types";

interface StatusRootProps {
  status: InitialSyncStatus;
}

const getIconColor = ({ status }: StatusRootProps) => {
  switch (status) {
    case "incomplete":
      return color("brand");
    default:
      return color("white");
  }
};

const getBorderColor = ({ status }: StatusRootProps) => {
  switch (status) {
    case "complete":
      return color("brand");
    default:
      return lighten("brand", 0.5);
  }
};

const getBackgroundColor = ({ status }: StatusRootProps) => {
  switch (status) {
    case "incomplete":
      return lighten("brand", 0.3);
    case "complete":
      return color("accent1");
    case "aborted":
      return color("accent3");
  }
};

export const StatusRoot = styled.div<StatusRootProps>`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 3rem;
  height: 3rem;
  color: ${getIconColor};
  border: 0.3125rem solid ${getBorderColor};
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
  width: 0.75rem;
  height: 0.75rem;
`;
