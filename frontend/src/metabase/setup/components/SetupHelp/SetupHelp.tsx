import { t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import ExternalLink from "metabase/core/components/ExternalLink";
import { SetupFooterRoot } from "./SetupHelp.styled";

export const SetupHelp = (): JSX.Element => {
  return (
    <SetupFooterRoot>
      {t`If you feel stuck`},{" "}
      <ExternalLink
        className="link"
        // eslint-disable-next-line no-unconditional-metabase-links-render -- Metabase setup
        href={MetabaseSettings.docsUrl(
          "configuring-metabase/setting-up-metabase",
        )}
        target="_blank"
      >{t`our getting started guide`}</ExternalLink>{" "}
      {t`is just a click away.`}
    </SetupFooterRoot>
  );
};
