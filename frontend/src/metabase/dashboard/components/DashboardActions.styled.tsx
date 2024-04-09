import styled from "@emotion/styled";

import FullscreenIcon from "metabase/components/icons/FullscreenIcon";
import NightModeIcon from "metabase/components/icons/NightModeIcon";
import { DashboardHeaderButton } from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";
import { RefreshWidget } from "metabase/dashboard/components/RefreshWidget";
import { color } from "metabase/lib/colors";

interface ShareButtonProps {
  canShareDashboard?: boolean;
}

export const ShareButton = styled(DashboardHeaderButton)<ShareButtonProps>`
  color: ${props => !props.canShareDashboard && color("text-light")};

  &:hover {
    color: ${props => props.canShareDashboard && color("brand")};
  }
`;

export const FullScreenButtonIcon = styled(FullscreenIcon)`
  &:hover {
    color: ${color("brand")};
  }
`;

export const NightModeButtonIcon = styled(NightModeIcon)`
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;

export const RefreshWidgetButton = styled(RefreshWidget)`
  &:hover {
    color: ${color("brand")};
  }
`;
