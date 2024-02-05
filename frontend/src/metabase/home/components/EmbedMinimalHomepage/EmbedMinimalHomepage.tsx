import { jt, t } from "ttag";
import { Box, Button, Card, Flex, Icon, Stack, Text, Title } from "metabase/ui";
import Link from "metabase/core/components/Link";
import ExternalLink from "metabase/core/components/ExternalLink";
import { getDocsUrl } from "metabase/selectors/settings";
import { useSelector } from "metabase/lib/redux";
import { hideEmbedHomepage } from "./util";

type EmbedMinimalHomepageProps = {
  onDismiss: () => void;
};

export const EmbedMinimalHomepage = ({
  onDismiss,
}: EmbedMinimalHomepageProps) => {
  const learnMoreUrl = useSelector(s =>
    // eslint-disable-next-line no-unconditional-metabase-links-render -- this is only visible to admins
    getDocsUrl(s, { page: "embedding/start" }),
  );

  const dismiss = () => {
    hideEmbedHomepage();
    onDismiss();
  };

  return (
    <Stack>
      <Text fw="bold">{t`Get started with Embedding Metabase in your app`}</Text>
      <Card px={40} py={32} maw={570}>
        <Stack spacing="lg">
          <Flex justify="space-between">
            <Title size="h4">{t`As you expressed interest in Embedding, follow these steps to start`}</Title>

            <Box onClick={dismiss}>
              <Icon name="close" />
            </Box>
          </Flex>

          <ol>
            <li>1. {t`Enable and configure embedding in settings`}</li>
            <li>
              2.{" "}
              {t`Select or create a dashboard or question to do a static embed`}
            </li>
            <li>3. {t`Follow the quickstart to do an interactive embed`}</li>
          </ol>

          <Stack spacing="sm">
            <Link to="/admin/settings/embedding-in-other-applications">
              <Button
                variant="filled"
                leftIcon={<Icon name="gear" />}
              >{t`Get started`}</Button>
            </Link>

            <Text>{jt`${(
              <ExternalLink href={learnMoreUrl}>{t`Learn more`}</ExternalLink>
            )} about embedding`}</Text>
          </Stack>
        </Stack>
      </Card>
    </Stack>
  );
};
