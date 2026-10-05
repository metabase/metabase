import { t } from "ttag";

import {
  type PillTab,
  PillTabNavigation,
} from "metabase/common/components/PillTabNavigation";
import * as Urls from "metabase/urls";
import type { WritebackActionId } from "metabase-types/api";

type ActionTabsProps = {
  actionId: WritebackActionId;
};

export function ActionTabs({ actionId }: ActionTabsProps) {
  const tabs: PillTab[] = [
    { label: t`Definition`, to: Urls.dataAction(actionId) },
    {
      label: t`Fields`,
      to: Urls.dataActionFields(actionId),
      isSelected: (pathname: string) =>
        pathname.startsWith(Urls.dataActionFields(actionId)),
    },
    { label: t`Run`, to: Urls.dataActionRun(actionId) },
    { label: t`Settings`, to: Urls.dataActionSettings(actionId) },
  ];
  return <PillTabNavigation tabs={tabs} />;
}
