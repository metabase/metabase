import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { getDocsUrl } from "metabase/selectors/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import { Box, Button, Icon } from "metabase/ui";
import { useSelector } from "metabase/utils/redux";

export function MetricEditorSidebar() {
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  const docsUrl = useSelector((state) =>
    getDocsUrl(state, {
      page: "data-modeling/metrics",
      anchor: "creating-a-metric",
    }),
  );

  return (
    <Box pt="md" pr={{ sm: "sm", lg: "md" }}>
      {showMetabaseLinks && (
        <Button
          component={ExternalLink}
          href={docsUrl}
          variant="subtle"
          rightSection={<Icon name="external" size={16} />}
        >
          {t`Docs`}
        </Button>
      )}
    </Box>
  );
}
