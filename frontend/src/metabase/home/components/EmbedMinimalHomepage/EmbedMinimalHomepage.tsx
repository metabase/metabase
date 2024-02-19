import { jt, t } from "ttag";
import { Button, Card, Flex, Icon, Stack, Text, Title } from "metabase/ui";
import Link from "metabase/core/components/Link";
import ExternalLink from "metabase/core/components/ExternalLink";
import { getDocsUrl } from "metabase/selectors/settings";
import { useSelector } from "metabase/lib/redux";
import { removeShowEmbedHomepageFlag } from "../../utils";
import { NumberedList } from "./EmbedMinimalHomepage.styled";

type EmbedMinimalHomepageProps = {
  onDismiss: () => void;
};

export const EmbedMinimalHomepage = ({
  onDismiss,
}: EmbedMinimalHomepageProps) => {
  const learnMoreBaseUrl = useSelector(state =>
    // eslint-disable-next-line no-unconditional-metabase-links-render -- this is only visible to admins
    getDocsUrl(state, { page: "embedding/start" }),
  );

  const dismiss = () => {
    removeShowEmbedHomepageFlag();
    onDismiss();
  };

  return (
    <Stack>
      <Text
        fw="bold"
        color="text-dark"
        // eslint-disable-next-line no-literal-metabase-strings -- this is only visible to admins
      >{t`Get started with Embedding Metabase in your app`}</Text>
      <Card px={40} py={32} maw={570}>
        <Stack spacing="lg">
          <Flex justify="space-between">
            <Title size="h4">{t`As you expressed interest in Embedding, follow these steps to start`}</Title>

            <Button
              variant="white"
              size="small"
              color="text-dark"
              p={0}
              onClick={dismiss}
            >
              <Icon name="close" />
            </Button>
          </Flex>

          <NumberedList>
            <li>{t`Enable and configure embedding in settings`}</li>
            <li>
              {t`Select or create a dashboard or question to do a static embed`}
            </li>
            <li>{t`Follow the quickstart to do an interactive embed`}</li>
          </NumberedList>

          <Stack spacing="sm">
            <Link to="/admin/settings/embedding-in-other-applications">
              <Button
                variant="filled"
                leftIcon={<Icon name="gear" />}
              >{t`Get started`}</Button>
            </Link>

            <Text>{jt`${(
              <ExternalLink
                href={learnMoreBaseUrl + "?utm_media=embed-minimal-homepage"}
                key="link"
              >{t`Learn more`}</ExternalLink>
            )} about embedding`}</Text>
          </Stack>
        </Stack>
      </Card>
    </Stack>
  );
};
