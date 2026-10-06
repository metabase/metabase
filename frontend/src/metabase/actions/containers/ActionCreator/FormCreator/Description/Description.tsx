import { jt, t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useSelector } from "metabase/redux";
import { getDocsUrl } from "metabase/selectors/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import { Text } from "metabase/ui";

export function Description() {
  const docsLink = useSelector((state) =>
    getDocsUrl(state, { page: "actions/custom" }),
  );
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);

  return (
    <Text c="text-secondary" lh="md">
      {jt`Configure your parameters' types and properties here. The values for these parameters can come from user input, or from a dashboard filter.`}
      {showMetabaseLinks && (
        <>
          {" "}
          <ExternalLink
            key="learn-more"
            href={docsLink}
          >{t`Learn more`}</ExternalLink>
        </>
      )}
    </Text>
  );
}
