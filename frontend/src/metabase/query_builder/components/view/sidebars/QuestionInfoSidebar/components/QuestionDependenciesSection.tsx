import { t } from "ttag";

import { UPGRADE_URL } from "metabase/admin/upsells/constants";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { UpsellCard } from "metabase/common/components/UpsellCard";
import { useSelector } from "metabase/lib/redux";
import { getDocsUrl } from "metabase/selectors/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import { Text } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

export function QuestionDependenciesSection({
  question: _question,
}: {
  question: Question;
}) {
  const dependenciesDocsUrl = useSelector((state) =>
    getDocsUrl(state, { page: "data-modeling/dependencies" }),
  );
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);

  return (
    <UpsellCard
      large
      title={t`Visualize dependencies`}
      buttonText={t`Try for free`}
      buttonLink={UPGRADE_URL}
      campaign="dependencies"
      location="question-info-sidebar"
      maxWidth="initial"
      fullWidth
      buttonStyle={{
        marginInlineStart: "2rem",
        width: "10rem",
        maxWidth: "100%",
      }}
    >
      <Text lh="1.5rem" style={{ paddingInlineStart: "2rem" }}>
        {t`See how your data connects and understand the impact of changes.`}
        {showMetabaseLinks && (
          <>
            {" "}
            <ExternalLink
              href={dependenciesDocsUrl}
            >{t`Learn more`}</ExternalLink>
          </>
        )}
      </Text>
    </UpsellCard>
  );
}
