import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { Box, Card, Code, Group, Icon, Text, Title } from "metabase/ui";

export function OverviewPage() {
  return (
    <>
      <Title>Overview</Title>
      <Card p="xl" mt="xl" pos="relative">
        <Title order={2} maw={500}>
          {t`
          Customizable, flexible, and scalable customer-facing analytics is just
          a snippet away.`}
        </Title>
        <Box mt="xl">
          <Card maw="90%" h={400} p={0}>
            <iframe
              src="https://metabase-public.metabaseapp.com/public/question/e048a0eb-6b52-43b0-8d61-22b02175f1b3"
              frameBorder="0"
              width="100%"
              height="100%"
            ></iframe>
          </Card>
        </Box>
        <Card pos="absolute" bottom={16} right={16} w={420} bg="black">
          <Code mt="md" bg="black">
            <Text c={color("text-white")}>
              {`<iframe
            src="https://metabase-public.metabaseapp.com/public/question/e048a0eb-6b52-43b0-8d61-22b02175f1b3"
            frameBorder="0"
            width="100%"
            height="100%"
          ></iframe>`}
            </Text>
          </Code>
        </Card>
      </Card>

      <Box mt="xl">
        <Title order={2}>{t`Docs & Resources`}</Title>
        <Card p="xl" mt="md">
          <Group>
            <Icon name="document" />
            <Box>
              <Title order={4}>Documentation</Title>
              {/* eslint-disable-next-line no-literal-metabase-strings -- This string only shows for admins. */}
              <Text>Developer documentation on embedding Metabase.</Text>
            </Box>
          </Group>
        </Card>
        <Card p="xl" mt="md">
          <Group>
            <Icon name="format_code" />
            <Box>
              <Title order={4}>Reference apps</Title>
              {/* eslint-disable-next-line no-literal-metabase-strings -- This string only shows for admins. */}
              <Text>Developer documentation on embedding Metabase.</Text>
            </Box>
          </Group>
        </Card>
      </Box>
    </>
  );
}
