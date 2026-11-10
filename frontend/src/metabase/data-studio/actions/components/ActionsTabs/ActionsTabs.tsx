import { t } from "ttag";

import {
  type PillTab,
  PillTabNavigation,
} from "metabase/common/components/PillTabNavigation";
import * as Urls from "metabase/urls";

export function ActionsTabs() {
  const tabs: PillTab[] = [
    {
      label: t`Actions`,
      to: Urls.dataStudioActions(),
      icon: "bolt",
      isSelected: (pathname: string) =>
        !pathname.startsWith(Urls.dataStudioActionSecrets()),
    },
    {
      label: t`Secrets`,
      to: Urls.dataStudioActionSecrets(),
      icon: "lock",
      isSelected: (pathname: string) =>
        pathname.startsWith(Urls.dataStudioActionSecrets()),
    },
  ];

  return <PillTabNavigation tabs={tabs} />;
}
