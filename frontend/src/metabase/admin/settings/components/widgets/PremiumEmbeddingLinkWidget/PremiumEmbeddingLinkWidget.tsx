import React from "react";
import { jt, t } from "ttag";

import MetabaseSettings from "metabase/lib/settings";
import ExternalLink from "metabase/core/components/ExternalLink";
import SettingHeader from "../../SettingHeader";

export const PremiumEmbeddingLinkWidget = () => {
  const setting = {
    display_name: t`embedding the entire metabase app`,
    description: jt`With ${(
      <ExternalLink key="upgrade-link" href={MetabaseSettings.upgradeUrl()}>
        {t`some of our paid plans,`}
      </ExternalLink>
    )} you can embed the full Metabase app and enable your users to drill-through to charts, browse collections, and use the graphical query builder. You can also get priority support, more tools to help you share your insights with your teams and powerful options to help you create seamless, interactive data experiences for your customers.`,
  };

  return <SettingHeader id="embedding-customization-info" setting={setting} />;
};
