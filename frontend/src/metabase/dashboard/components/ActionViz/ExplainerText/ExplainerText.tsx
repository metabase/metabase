import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { Box } from "metabase/ui";

export function ExplainerText() {
  const { url, showMetabaseLinks } = useDocsUrl("dashboards/actions");
  return (
    <Box component="p" mx="xxl" c="text-secondary">
      {t`You can either ask users to enter values, or use the value of a dashboard filter.`}
      {showMetabaseLinks && (
        // a className stops ExternalLink falling back to CS.link (hover underline)
        <Box
          component={ExternalLink}
          className={CS.textBrand}
          href={url}
          ml="sm"
        >
          {t`Learn more.`}
        </Box>
      )}
    </Box>
  );
}
