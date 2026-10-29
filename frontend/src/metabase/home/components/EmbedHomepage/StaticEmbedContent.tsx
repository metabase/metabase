import { t } from "ttag";

import staticEmbeddingExampleImage from "assets/img/static-embedding-example.png";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Link } from "metabase/common/components/Link";
import { Box, Button, Group, Text } from "metabase/ui";

import S from "./EmbedHomepage.module.css";
import { trackEmbeddingHomepageExampleDashboardClick } from "./analytics";

type StaticEmbedContentProps = {
  exampleDashboardLink?: string;
  learnMoreStaticEmbedUrl: string;
  showImage?: boolean;
};

export const StaticEmbedContent = ({
  exampleDashboardLink,
  learnMoreStaticEmbedUrl,
  showImage,
}: StaticEmbedContentProps) => (
  <Box component="section" aria-labelledby="static-embed-title">
    <Text
      fw="bold"
      mb="sm"
      size="lg"
      color="text-secondary"
      id="static-embed-title"
    >{t`Guest embedding`}</Text>
    <Text mb="lg">
      {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins. */}
      {t`Embed a dashboard in a 'Powered by Metabase' iframe with interactivity limited to filters and tooltips, and a few customization options. The iframe loads a Metabase URL secured with a signed JSON Web Token (JWT). Appears with "Powered by Metabase", on Open Source and Starter plans, with the option to remove on Pro and Enterprise. As the simplest form of embedding, you can add a dashboard into your app in a few minutes with just a snippet.`}
    </Text>
    {showImage && (
      <Box
        component="img"
        className={S.border}
        src={staticEmbeddingExampleImage}
        alt="Static embedding example"
        w="100%"
        mb="lg"
      />
    )}
    <Group gap="lg">
      {exampleDashboardLink && (
        <Link
          to={exampleDashboardLink}
          onClick={trackEmbeddingHomepageExampleDashboardClick}
        >
          <Button>{t`Embed an example dashboard`}</Button>
        </Link>
      )}
      <ExternalLink href={learnMoreStaticEmbedUrl}>
        <Button variant="subtle">{t`Read the docs`}</Button>
      </ExternalLink>
    </Group>
  </Box>
);
