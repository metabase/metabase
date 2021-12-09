import React from "react";
import { t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import ExternalLink from "metabase/components/ExternalLink";
import { SetupHelpRoot } from "./SetupHelp.styled";

const SetupHelp = () => {
  return (
    <SetupHelpRoot>
      {t`If you feel stuck`},{" "}
      <ExternalLink
        className="link"
        href={MetabaseSettings.docsUrl("setting-up-metabase")}
        target="_blank"
      >{t`our getting started guide`}</ExternalLink>{" "}
      {t`is just a click away.`}
    </SetupHelpRoot>
  );
};

export default SetupHelp;
