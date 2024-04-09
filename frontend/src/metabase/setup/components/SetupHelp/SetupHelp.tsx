import { t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import CS from "metabase/css/core/index.css";
import MetabaseSettings from "metabase/lib/settings";

import { SetupFooterRoot } from "./SetupHelp.styled";

export const SetupHelp = (): JSX.Element => {
  return (
    <SetupFooterRoot>
      {t`If you feel stuck`},{" "}
      <ExternalLink
        className={CS.link}
        href={MetabaseSettings.docsUrl(
          "configuring-metabase/setting-up-metabase",
        )}
        target="_blank"
      >{t`our getting started guide`}</ExternalLink>{" "}
      {t`is just a click away.`}
    </SetupFooterRoot>
  );
};
