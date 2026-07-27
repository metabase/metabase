import { useHasTokenFeature } from "metabase/common/hooks";
import { type InsightsLinkProps, PLUGIN_AUDIT } from "metabase/plugins";

import { InsightsTab } from "../InsightsTab";

export const InsightsTabOrLink = (props: InsightsLinkProps) => {
  const showTab = !useHasTokenFeature("audit_app");

  return (
    <>
      {showTab && <InsightsTab />}
      <PLUGIN_AUDIT.InsightsLink {...props} />
    </>
  );
};
