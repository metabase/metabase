import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Button, Card, Stack, Text } from "metabase/ui";

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
      data-testid="simple-embed-terms-card"
      pos="fixed"
      bottom="1.25rem"
      right="1.25rem"
      w="20rem"
      bd="1px solid var(--mb-color-border)"
      className={CS.z1}
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
  t`When using Embedded Analytics JS, each end user should have their own Metabase account.`,

  t`Sharing accounts is a security risk. Even if you filter data on the client side, each user could use their token to view any data visible to that shared user account.`,

  // eslint-disable-next-line no-literal-metabase-strings -- used in embed flow in main app
  t`We consider shared accounts to be unfair usage. Fair usage involves giving each end user of the embedded analytics their own Metabase account.`,
];
