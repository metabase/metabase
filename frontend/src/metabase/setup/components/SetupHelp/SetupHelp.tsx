import React from "react";
import { t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import ExternalLink from "metabase/components/ExternalLink";
import { SetupFooterRoot } from "./SetupHelp.styled";

const SetupHelp = (): JSX.Element => {
  return (
    <SetupFooterRoot>
      {t`If you feel stuck`},{" "}
      <ExternalLink
        className="link"
        href={MetabaseSettings.docsUrl("setting-up-metabase")}
        target="_blank"
      >{t`our getting started guide`}</ExternalLink>{" "}
      {t`is just a click away.`}
    </SetupFooterRoot>
  );
};

export default SetupHelp;
