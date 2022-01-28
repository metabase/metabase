import React from "react";
import { jt } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import ExternalLink from "metabase/core/components/ExternalLink";
import SettingHeader from "../SettingHeader";

export const EmbeddingCustomizationInfo = () => {
  const setting = {
    display_name: "Customization",
    description: (
      <p style={{ maxWidth: "460px" }}>
        {jt`Looking to remove the “Powered by Metabase” logo, customize colors
        and make it your own? ${(
          <ExternalLink href={MetabaseSettings.upgradeUrl()}>
            Explore our paid plans.
          </ExternalLink>
        )}`}
      </p>
    ),
  };

  return <SettingHeader id="embedding-customization-info" setting={setting} />;
};
