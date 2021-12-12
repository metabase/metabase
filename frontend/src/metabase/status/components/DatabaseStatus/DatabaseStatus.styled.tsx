import styled from "styled-components";
import { color, lighten } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import { InitialSyncStatus } from "../../types";

interface Props {
  status: InitialSyncStatus;
}

const getIconColor = ({ status }: Props) => {
  switch (status) {
    case "incomplete":
      return color("brand");
    default:
      return color("white");
  }
};

const getIconSize = ({ status }: Props) => {
  switch (status) {
    case "incomplete":
      return "0.875rem";
    default:
      return "0.75rem";
  }
};

const getBackgroundColor = ({ status }: Props) => {
  switch (status) {
    case "incomplete":
      return "transparent";
    case "complete":
      return color("accent1");
    case "aborted":
      return color("accent3");
  }
};

export const StatusRoot = styled.div`
  position: relative;
  width: 3rem;
  height: 3rem;
  margin: 1rem 0 0 0;
`;

export const StatusContainer = styled.div<Props>`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  color: ${getIconColor};
  border: 0.25rem solid ${lighten("brand", 0.5)};
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

export const StatusImage = styled.svg`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
`;

export const StatusCircle = styled.circle`
  fill: none;
  stroke: ${color("brand")};
  transform: rotate(-90deg);
  transform-origin: center;
  transition: stroke-dasharray 0.2s;
`;
