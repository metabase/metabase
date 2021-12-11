import styled from "styled-components";
import { color, lighten } from "metabase/lib/colors";
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
      return lighten("brand", 0.2);
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
  border: 0.375rem solid ${getBorderColor};
  background-color: ${getBackgroundColor};
`;
