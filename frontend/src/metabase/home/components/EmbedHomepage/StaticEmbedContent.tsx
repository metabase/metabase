import styled from "@emotion/styled";
import { Link } from "react-router";
import { t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import { Box, Button, Group, Text } from "metabase/ui";

import { trackEmbeddingHomepageExampleDashboardClick } from "./analytics";

type StaticEmbedContentProps = {
  exampleDashboardLink?: string;
  learnMoreStaticEmbedUrl: string;
};

export const StaticEmbedContent = ({
  exampleDashboardLink,
  learnMoreStaticEmbedUrl,
}: StaticEmbedContentProps) => (
  <Box>
    <Text
      fw="bold"
      mb="sm"
      size="lg"
      color="text-medium"
    >{t`Static embedding`}</Text>
    <Text mb="md">
      {/* eslint-disable-next-line no-literal-metabase-strings -- This string only shows for admins. */}
      {t`Embed a dashboard in a 'Powered by Metabase' iframe with interactivity limited to filters and tooltips, and a few customization options. The iframe loads a Metabase URL secured with a signed JSON Web Token (JWT). Appears with "Powered by Metabase", on Open Source and Starter plans, with the option to remove on Pro and Enterprise. As the simplest form of embedding, you can add a dashboard into your app in a few minutes with just a snippet.`}
    </Text>
    <StaticEmbedImage
      src="/app/assets/img/static-embedding-example.png"
      alt="Static embedding example"
    />
    <Group spacing="md">
      {exampleDashboardLink && (
        <Link
          to={exampleDashboardLink}
          onClick={trackEmbeddingHomepageExampleDashboardClick}
        >
          <Button variant="outline">{t`Embed an example dashboard`}</Button>
        </Link>
      )}
      <ExternalLink href={learnMoreStaticEmbedUrl}>
        <Button variant="subtle">{t`Read the docs`}</Button>
      </ExternalLink>
    </Group>
  </Box>
);

const StaticEmbedImage = styled.img`
  width: 100%;
  margin-bottom: 1rem;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border};
`;
