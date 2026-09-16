import {
  PaneHeader,
  type PaneHeaderProps,
} from "metabase/common/data-studio/components/PaneHeader";
import { AppSwitcher } from "metabase/nav/components/AppSwitcher";

import { MetabotDataStudioButton } from "./MetabotDataStudioButton";

export interface DataStudioPaneHeaderProps extends Omit<
  PaneHeaderProps,
  "controls"
> {
  showMetabotButton?: boolean;
  showAppSwitcher?: boolean;
}

export function DataStudioPaneHeader({
  showMetabotButton,
  showAppSwitcher = true,
  ...props
}: DataStudioPaneHeaderProps) {
  return (
    <PaneHeader
      {...props}
      controls={
        <>
          {showMetabotButton && <MetabotDataStudioButton />}
          {showAppSwitcher && <AppSwitcher />}
        </>
      }
    />
  );
}
