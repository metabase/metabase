import { t } from "ttag";

import { Button, Card, Stack, Text } from "metabase/ui";

import S from "./SimpleEmbedTermsCard.module.css";

export const SimpleEmbedTermsCard = ({
  onAccept,
}: {
  onAccept?: () => void;
}) => {
  const [message1, message2, message3] = getMessages();

  return (
    <Card
      shadow="lg"
      p="md"
      className={S.TermsCard}
      data-testid="simple-embed-terms-card"
    >
      <Stack gap="md">
        <Text size="md" fw="bold" lh="sm">
          {t`First, some legalese.`}
        </Text>

        <Stack gap="sm">
          <Text size="sm" c="text-medium">
            {message1}
          </Text>

          <Text size="sm" c="text-medium">
            {message2}
          </Text>

          <Text size="sm" c="text-medium">
            {message3}
          </Text>
        </Stack>

        <Stack align="flex-end">
          <Button size="sm" onClick={onAccept} variant="primary">
            {t`Got it`}
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
};

export const getMessages = () => [
  // eslint-disable-next-line no-literal-metabase-strings -- used in embed flow in main app
  t`When using simple embedding, each end user should have their own Metabase account.`,

  t`Sharing accounts is a security risk. Even if you filter data on the client side, each user could use their token to view any data visible to that shared user account.`,

  // eslint-disable-next-line no-literal-metabase-strings -- used in embed flow in main app
  t`We consider shared accounts to be unfair usage. Fair usage involves giving each end user of the embedded analytics their own Metabase account.`,
];
