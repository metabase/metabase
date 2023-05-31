import { t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import ExternalLink from "metabase/core/components/ExternalLink";
import { SetupFooterRoot } from "./SetupHelp.styled";

const SetupHelp = (): JSX.Element => {
  return (
    <SetupFooterRoot>
      {t`If you feel stuck`},{" "}
      <ExternalLink
        className="link"
        href={MetabaseSettings.docsUrl(
          "configuring-metabase/setting-up-metabase",
        )}
        target="_blank"
      >{t`our getting started guide`}</ExternalLink>{" "}
      {t`is just a click away.`}
    </SetupFooterRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SetupHelp;
