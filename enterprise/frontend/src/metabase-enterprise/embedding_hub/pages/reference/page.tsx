import { t } from "ttag";

import { color } from "metabase/lib/colors";
import {
  Box,
  Card,
  Divider,
  Group,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  Textarea,
  Button,
  Select,
  Space
} from "metabase/ui";

export function ReferencePage() {
  return (
    <>
      <Title>{t`Admin UI Patterns`}</Title>
      <Text mb="xl">{t`This page serves as a reference for Metabase admin UI design patterns to maintain consistency across the application.`}</Text>

      {/* Card Design Pattern */}
      <Card p="xl" mt="xl" withBorder shadow="sm">
        <Title order={2} mb="xs">{t`Card Design Pattern`}</Title>
        <Text mb="lg">{t`The standard card component used throughout the admin interface with consistent styling.`}</Text>
        <Divider mb="md" />
        <Box bg={color("bg-light")} p="md">
          <Text fw={600} mb="xs">{t`Specifications:`}</Text>
          <ul>
            <li>{t`White background`}</li>
            <li>{t`Light gray border (1px)`}</li>
            <li>{t`Border radius: 4-6px`}</li>
            <li>{t`Internal padding: 24px`}</li>
            <li>{t`Light shadow for visual depth`}</li>
            <li>{t`32px spacing between cards`}</li>
          </ul>
        </Box>
      </Card>

      {/* Site Information Section Example */}
      <Card p="xl" mt="2rem" withBorder shadow="sm">
        <Title order={2} mb="xs">{t`Site Information Section`}</Title>
        <Text mb="lg">{t`A common section for site-wide configuration.`}</Text>
        <Divider mb="xl" />

        <Stack gap="lg">
          <TextInput
            label={t`Site Name`}
            description={t`The name used for this instance of Metabase.`}
            placeholder="Metabase"
            defaultValue="Metabase"
          />

          <Textarea
            label={t`Site Description`}
            description={t`A description of your Metabase instance displayed on the login page.`}
            placeholder="Enter a description..."
            minRows={3}
          />

          <TextInput
            label={t`Site URL`}
            description={t`The base URL of this Metabase instance. Used for emails and embedding.`}
            placeholder="https://metabase.example.com"
            defaultValue="https://metabase.example.com"
          />
        </Stack>

        <Box mt="xl">
          <Button>{t`Save changes`}</Button>
        </Box>
      </Card>

      {/* Toggle Settings Section Example */}
      <Card p="xl" mt="2rem" withBorder shadow="sm">
        <Title order={2} mb="xs">{t`Toggle Settings Pattern`}</Title>
        <Text mb="lg">{t`Used for enabling or disabling features.`}</Text>
        <Divider mb="xl" />

        <Stack gap="xl">
          <Group justify="space-between">
            <Box>
              <Text fw={600}>{t`Enable Embedding`}</Text>
              <Text size="sm" c={color("text-medium")}>
                {t`Allow charts and dashboards to be embedded in other applications.`}
              </Text>
            </Box>
            <Switch defaultChecked size="md" />
          </Group>

          <Group justify="space-between">
            <Box>
              <Text fw={600}>{t`Public Sharing`}</Text>
              <Text size="sm" c={color("text-medium")}>
                {t`Enable admins to create publicly viewable links to questions and dashboards.`}
              </Text>
            </Box>
            <Switch size="md" />
          </Group>

          <Group justify="space-between">
            <Box>
              <Text fw={600}>{t`Nested Queries`}</Text>
              <Text size="sm" c={color("text-medium")}>
                {t`Allow using saved questions as source data for other queries.`}
              </Text>
            </Box>
            <Switch defaultChecked size="md" />
          </Group>
        </Stack>
      </Card>

      {/* Dropdown Selection Pattern */}
      <Card p="xl" mt="2rem" withBorder shadow="sm">
        <Title order={2} mb="xs">{t`Selection Controls Pattern`}</Title>
        <Text mb="lg">{t`Pattern for selection inputs and dropdowns.`}</Text>
        <Divider mb="xl" />

        <Stack gap="xl">
          <Select
            label={t`Default Language`}
            description={t`The default language for this Metabase instance.`}
            placeholder="Select a language"
            defaultValue="en"
            data={[
              { value: 'en', label: 'English' }
            ]}
          />

          <Select
            label={t`Report Timezone`}
            description={t`The timezone used for displaying dates in reports.`}
            placeholder="Select a timezone"
            defaultValue="UTC"
            data={[
              { value: 'UTC', label: 'UTC' }
            ]}
          />
        </Stack>

        <Space h="xl" />

        <Box>
          <Text fw={600} mb="xs">{t`Date Style`}</Text>
          <Text size="sm" mb="sm" c={color("text-medium")}>
            {t`How would you like dates to be displayed throughout Metabase?`}
          </Text>
          <Group>
            <Button variant="outline">MM/DD/YYYY</Button>
            <Button variant="outline">DD/MM/YYYY</Button>
            <Button variant="filled">YYYY-MM-DD</Button>
          </Group>
        </Box>
      </Card>

      {/* Danger Zone Pattern */}
      <Card p="xl" mt="2rem" withBorder shadow="sm" mb="2rem">
        <Title order={2} mb="xs" c={color("danger")}>{t`Danger Zone Pattern`}</Title>
        <Text mb="lg">{t`Used for destructive actions that should be handled with care.`}</Text>
        <Divider mb="xl" />

        <Box p="md">
          <Group justify="space-between">
            <Box>
              <Text fw={600}>{t`Reset to defaults`}</Text>
              <Text size="sm" c={color("text-medium")}>
                {t`Reset all settings to their default values.`}
              </Text>
            </Box>
            <Button color="red" variant="outline">{t`Reset`}</Button>
          </Group>
        </Box>

        <Box p="md" mt="md">
          <Group justify="space-between">
            <Box>
              <Text fw={600}>{t`Clear cache`}</Text>
              <Text size="sm" c={color("text-medium")}>
                {t`Clear the application cache. This can sometimes resolve issues with displaying data.`}
              </Text>
            </Box>
            <Button color={color("danger")} variant="filled">{t`Clear`}</Button>
          </Group>
        </Box>
      </Card>
    </>
  );
}
