// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import { Link } from "react-router";
import { match } from "ts-pattern";
import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
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
      <Button
        component={Link}
        to={"/admin/embedding/setup-guide"}
        variant="outline"
      >
        {t`Go to setup guide`}
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
        color="text-secondary"
        id="embed-js-title"
      >{t`Modular embedding`}</Text>
      <Text mb="md">
        {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins. */}
        {t`A JavaScript library built on top of Metabase’s modular embedding SDK that lets you embed individual components (charts, dashboards, query builder) using plain JS — no React setup required. You get per-component controls like drill-through, parameters, downloads, theming.`}
      </Text>
      {showImage && (
        <EmbedJsImage
          src="/app/assets/img/embed-js-example.png"
          alt="Modular embedding example"
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
