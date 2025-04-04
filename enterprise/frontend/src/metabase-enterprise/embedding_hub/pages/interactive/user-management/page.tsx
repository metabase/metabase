import { t } from "ttag";

import { color } from "metabase/lib/colors";
import {
  Anchor,
  Box,
  Button,
  Card,
  Group,
  Select,
  Text,
  Title,
} from "metabase/ui";

export function UserManagementPage() {
  return (
    <>
      <Title>{t`User management`}</Title>
      <Card p="lg" mt="xl" withBorder>
        <Group justify="space-between" align="top">
          <Box maw={480}>
            <Title order={2} mb="xs">{t`Strategy`}</Title>
            <Text color={color("text-medium")}>{t`
          If users of your embeds are all part of the same org, single tenant is fine, otherwise you  can choose Multi tenant to manage resources easily for multiple organizations. Fix this copy Kyle, it sucks. Halp jeff.
          `}</Text>
          </Box>
          <Select
            defaultValue="single-tenant"
            data={[
              { value: "single-tenant", label: t`Single tenant` },
              { value: "multi-tenant", label: t`Multi tenant` },
            ]}
          />
        </Group>
      </Card>
      <Box mt="xl">
        <Title order={2}>{t`Multi tenant features`}</Title>

        <Box mt="lg">
          <Title order={4}>{t`Tenants`}</Title>

          <Card p="lg" mt="sm" withBorder>
            <Group justify="space-between">
              <Title order={4}>0</Title>
              <Anchor>{t`View and manage`}</Anchor>
            </Group>
          </Card>
        </Box>
        <Box mt="lg">
          <Group justify="space-between">
            <Box>
              <Title order={4}>{t`Tenant groups`}</Title>
              <Text>{t`Tenant groups help you manage patterns for data access and content permissions across all your tenants.`}</Text>
            </Box>
            <Button>{t`Create a tenant group`}</Button>
          </Group>

          <Card p="lg" mt="sm" withBorder>
            <Group justify="space-between">
              <Text>Basic editors</Text>
              <Anchor>{t`Manage permissions`}</Anchor>
            </Group>
            <Group justify="space-between">
              <Text>Basic viewers</Text>
              <Anchor>{t`Manage permissions`}</Anchor>
            </Group>
          </Card>
        </Box>

        <Box mt="xl">
          <Title order={2} mb="sm">{t`Provisioning`}</Title>
          <Card p="lg" mt="sm" withBorder>
            <Group justify="space-between">
              <Text>JWT - Disabled</Text>
              <Button>{t`Set up JWT`}</Button>
            </Group>
          </Card>
        </Box>
      </Box>
    </>
  );
}
