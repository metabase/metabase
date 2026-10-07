import type { JSX } from "react";
import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { Box } from "metabase/ui";

import S from "./SetupHelp.module.css";

export const SetupHelp = (): JSX.Element => {
  const { url: docsUrl } = useDocsUrl(
    "configuring-metabase/setting-up-metabase",
  );
  return (
    <Box
      component="footer"
      className={S.root}
      c="text-secondary"
      p="lg"
      mb="xxl"
      ta="center"
    >
      {t`If you feel stuck`},{" "}
      <ExternalLink
        className={CS.link}
        href={docsUrl}
        target="_blank"
      >{t`our getting started guide`}</ExternalLink>{" "}
      {t`is just a click away.`}
    </Box>
  );
};
