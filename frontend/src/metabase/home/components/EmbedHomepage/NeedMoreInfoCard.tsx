import { jt, t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import { Card, Text } from "metabase/ui";

type NeedMoreInfoCardProps = {
  embeddingDocsUrl: string;
  analyticsDocsUrl: string;
};

export const NeedMoreInfoCard = ({
  embeddingDocsUrl,
  analyticsDocsUrl,
}: NeedMoreInfoCardProps) => (
  <Card px="xl">
    <Text color="text-dark" fw="bold">{t`Need more information?`}</Text>
    <Text color="text-light" size="sm">
      {/* eslint-disable-next-line no-literal-metabase-strings -- only visible to admins */}
      {jt`Explore the ${(
        <ExternalLink key="embedding-docs" href={embeddingDocsUrl}>
          {t`embedding documentation`}
        </ExternalLink>
      )} and ${(
        <ExternalLink
          key="customer-facing-analytics-docs"
          href={analyticsDocsUrl}
        >
          {t`customer-facing analytics articles`}
        </ExternalLink>
      )} to learn more about what Metabase offers.`}
    </Text>
  </Card>
);
