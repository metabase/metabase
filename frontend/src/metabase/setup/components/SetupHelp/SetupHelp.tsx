import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";

import { SetupFooterRoot } from "./SetupHelp.styled";

export const SetupHelp = (): JSX.Element => {
  const { url: docsUrl } = useDocsUrl(
    "configuring-metabase/setting-up-metabase",
  );
  return (
    <SetupFooterRoot>
      {t`If you feel stuck`},{" "}
      <ExternalLink
        className={CS.link}
        href={docsUrl}
        target="_blank"
      >{t`our getting started guide`}</ExternalLink>{" "}
      {t`is just a click away.`}
    </SetupFooterRoot>
  );
};
