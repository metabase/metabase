import { t } from "ttag";

import {
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase/common/data-studio/components/PaneHeader";
import * as Urls from "metabase/urls";

export const RunTabs = () => {
  return <PaneHeaderTabs tabs={getTabs()} />;
};

function getTabs(): PaneHeaderTab[] {
  return [
    {
      label: t`Runs`,
      to: Urls.transformGraphRunList(),
    },
    {
      label: t`Individual transform runs`,
      to: Urls.transformRunList(),
    },
  ];
}
