import styled from "@emotion/styled";

import FullscreenIcon from "metabase/components/icons/FullscreenIcon";
import NightModeIcon from "metabase/components/icons/NightModeIcon";
import { RefreshWidget } from "metabase/dashboard/components/RefreshWidget";

export const FullScreenButtonIcon = styled(FullscreenIcon)`
  &:hover {
    color: var(--mb-color-brand);
  }
`;

export const NightModeButtonIcon = styled(NightModeIcon)`
  cursor: pointer;

  &:hover {
    color: var(--mb-color-brand);
  }
`;

export const RefreshWidgetButton = styled(RefreshWidget)`
  &:hover {
    color: var(--mb-color-brand);
  }
`;
