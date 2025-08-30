// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import { Link } from "react-router";
import { match } from "ts-pattern";
import { t } from "ttag";

import ExternalLink from "metabase/common/components/ExternalLink";
import { Box, Button, Group, Text } from "metabase/ui";

type EmbedJsContentProps = {
  embedJsDocsUrl: string;
  showImage?: boolean;
  hasEmbeddingFeature?: boolean;
  variant: "oss/starter" | "ee";
};

export const EmbedJsContent = ({
  embedJsDocsUrl,
  showImage,
  hasEmbeddingFeature,
  variant,
}: EmbedJsContentProps) => {
  const cta = match({ variant, hasEmbeddingFeature })
    .with({ variant: "ee", hasEmbeddingFeature: true }, () => (
      <Button component={Link} to={"/embed-js"} variant="outline">
        {t`Start embedding`}
      </Button>
    ))
    .with({ variant: "ee", hasEmbeddingFeature: false }, () => (
      <Button component={Link} to={"/admin/settings/license"} variant="outline">
        {t`Activate license`}
      </Button>
    ))
    .otherwise(() => null);

  return (
    <Box component="section" aria-labelledby="embed-js-title">
      <Text
        fw="bold"
        mb="sm"
        size="lg"
        color="text-medium"
        id="embed-js-title"
      >{t`Embedded analytics JS`}</Text>
      <Text mb="md">
        {/* eslint-disable-next-line no-literal-metabase-strings -- This string only shows for admins. */}
        {t`Embedded analytics JS is a JavaScript library built on top of Metabase’s Embedded analytics SDK for React, but it does not require using React or setting up full SDK embedding. Unlike with interactive embedding, where you embed the entire Metabase app in an iframe, Embedded analytics JS lets you choose from a set of predefined components like a single chart, a dashboard with optional drill-through, or query builder, and customize those components.`}
      </Text>
      {showImage && (
        <EmbedJsImage
          src="/app/assets/img/embed-js-example.png"
          alt="Embedded analytics JS example"
        />
      )}
      <Group gap="md">
        {cta}

        <ExternalLink href={embedJsDocsUrl}>
          <Button
            variant={cta ? "subtle" : "outline"}
          >{t`Read the docs`}</Button>
        </ExternalLink>
      </Group>
    </Box>
  );
};

const EmbedJsImage = styled.img`
  width: 100%;
  margin-bottom: 1rem;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border};
`;
