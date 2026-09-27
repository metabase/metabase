import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";
import { Box } from "metabase/ui";

import S from "./ExplainerText.module.css";

export function ExplainerText() {
  const { url, showMetabaseLinks } = useDocsUrl("dashboards/actions");
  return (
    <Box component="p" mx="xxl" c="text-secondary">
      {t`You can either ask users to enter values, or use the value of a dashboard filter.`}
      {showMetabaseLinks && (
        <ExternalLink className={S.brandLink} href={url}>
          {t`Learn more.`}
        </ExternalLink>
      )}
    </Box>
  );
}
