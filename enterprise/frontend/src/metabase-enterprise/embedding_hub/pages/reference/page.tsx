import { t } from "ttag";

import { color } from "metabase/lib/colors";
import {
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  Group,
  Input,
  Radio,
  Select,
  Space,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
} from "metabase/ui";

export function ReferencePage() {
  return (
    <>
      <Title>{t`Admin UI Patterns`}</Title>
      <Text mb="xl">{t`This page serves as a reference for Metabase admin UI design patterns to maintain consistency across the application.`}</Text>

      {/* Card Design Pattern */}
      <Card p="xl" mt="xl" bg={color("bg-light")} withBorder shadow="none">
        <Title order={2} mb="xs">{t`Card Design Pattern`}</Title>
        <Text mb="lg">{t`The standard card component used throughout the admin interface with consistent styling.`}</Text>
        <Divider mb="md" />
        <Box p="md">
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
      <Card p="xl" mt="2rem" bg={color("bg-light")} withBorder shadow="none">
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
      <Card p="xl" mt="2rem" bg={color("bg-light")} withBorder shadow="none">
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

      {/* Form Layout Pattern */}
      <Card p="xl" mt="2rem" bg={color("bg-light")} withBorder shadow="none">
        <Title order={2} mb="xs">{t`Form Layout Pattern`}</Title>
        <Text mb="lg">{t`Mixed form elements combined in a logical layout.`}</Text>
        <Divider mb="xl" />

        <Stack gap="xl">
          <Box>
            <Text fw={600} mb="md">{t`Database Connection Settings`}</Text>

            <Group align="flex-start" grow>
              <Stack gap="md">
                <TextInput
                  label={t`Host`}
                  placeholder="localhost"
                  required
                />
                <TextInput
                  label={t`Port`}
                  placeholder="5432"
                  required
                />
              </Stack>

              <Stack gap="md">
                <TextInput
                  label={t`Database Name`}
                  placeholder="metabase_db"
                  required
                />
                <Select
                  label={t`Connection Type`}
                  placeholder="Select a type"
                  defaultValue="direct"
                  data={[
                    { value: 'direct', label: 'Direct Connection' }
                  ]}
                />
              </Stack>
            </Group>

            <Space h="md" />

            <Group align="flex-start" grow>
              <TextInput
                label={t`Username`}
                placeholder="database_user"
              />
              <TextInput
                label={t`Password`}
                placeholder="••••••••"
                type="password"
              />
            </Group>

            <Space h="md" />

            <Radio.Group
              label={t`SSL Options`}
              defaultValue="disabled"
            >
              <Stack mt="xs">
                <Radio value="disabled" label={t`No SSL`} />
                <Radio value="enabled" label={t`Use SSL`} />
                <Radio value="verify" label={t`Use SSL with certificate verification`} />
              </Stack>
            </Radio.Group>
          </Box>

          <Divider />

          <Group position="right">
            <Button variant="subtle">{t`Cancel`}</Button>
            <Button>{t`Save connection`}</Button>
          </Group>
        </Stack>
      </Card>

      {/* List Display Pattern */}
      <Card p="xl" mt="2rem" bg={color("bg-light")} withBorder shadow="none">
        <Title order={2} mb="xs">{t`List Display Pattern`}</Title>
        <Text mb="lg">{t`Display lists of items with status indicators and actions.`}</Text>
        <Divider mb="xl" />

        <Stack gap="md">
          <Box p="md" style={{ border: `1px solid ${color("border")}`, borderRadius: '4px' }}>
            <Group justify="space-between">
              <Group gap="md">
                <Box style={{ width: '8px', height: '8px', borderRadius: '50%', background: color("success") }}></Box>
                <Box>
                  <Text fw={600}>Sales Analytics</Text>
                  <Text size="sm" c={color("text-medium")}>PostgreSQL • Last updated 2 hours ago</Text>
                </Box>
                <Badge color="green">Active</Badge>
              </Group>
              <Group gap="sm">
                <Button variant="subtle" size="sm">{t`Edit`}</Button>
                <Button variant="subtle" size="sm">{t`Sync`}</Button>
              </Group>
            </Group>
          </Box>

          <Box p="md" style={{ border: `1px solid ${color("border")}`, borderRadius: '4px' }}>
            <Group justify="space-between">
              <Group gap="md">
                <Box style={{ width: '8px', height: '8px', borderRadius: '50%', background: color("success") }}></Box>
                <Box>
                  <Text fw={600}>User Data</Text>
                  <Text size="sm" c={color("text-medium")}>MongoDB • Last updated 1 day ago</Text>
                </Box>
                <Badge color="green">Active</Badge>
              </Group>
              <Group gap="sm">
                <Button variant="subtle" size="sm">{t`Edit`}</Button>
                <Button variant="subtle" size="sm">{t`Sync`}</Button>
              </Group>
            </Group>
          </Box>

          <Box p="md" style={{ border: `1px solid ${color("border")}`, borderRadius: '4px' }}>
            <Group justify="space-between">
              <Group gap="md">
                <Box style={{ width: '8px', height: '8px', borderRadius: '50%', background: color("error") }}></Box>
                <Box>
                  <Text fw={600}>Marketing Campaigns</Text>
                  <Text size="sm" c={color("text-medium")}>MySQL • Last updated 3 days ago</Text>
                </Box>
                <Badge color="red">Error</Badge>
              </Group>
              <Group gap="sm">
                <Button variant="subtle" size="sm">{t`Edit`}</Button>
                <Button variant="subtle" size="sm">{t`Diagnose`}</Button>
              </Group>
            </Group>
          </Box>
        </Stack>

        <Box mt="lg">
          <Button variant="outline">{t`Add new database`}</Button>
        </Box>
      </Card>

      {/* Search and Filter Pattern */}
      <Card p="xl" mt="2rem" bg={color("bg-light")} withBorder shadow="none">
        <Title order={2} mb="xs">{t`Search and Filter Pattern`}</Title>
        <Text mb="lg">{t`Controls for searching and filtering content.`}</Text>
        <Divider mb="xl" />

        <Group justify="space-between" mb="lg">
          <Box style={{ position: 'relative', width: '300px' }}>
            <TextInput
              placeholder={t`Search by name or description...`}
              style={{ width: '100%' }}
            />
            <Box style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)' }}>
              <i className="fa fa-search" style={{ color: color('text-light') }}/>
            </Box>
          </Box>

          <Group gap="sm">
            <Select
              placeholder={t`Filter by type`}
              clearable
              data={[
                { value: 'question', label: 'Questions' }
              ]}
            />
            <Button variant="outline">{t`Apply filters`}</Button>
          </Group>
        </Group>

        <Divider mb="md" />

        <Stack gap="md">
          <Group justify="space-between" pb="sm">
            <Group gap="sm">
              <Checkbox id="select-all" />
              <Text>{t`Select all`}</Text>
            </Group>
            <Group gap="sm">
              <Button variant="subtle" size="sm">{t`Move`}</Button>
              <Button variant="subtle" size="sm">{t`Archive`}</Button>
            </Group>
          </Group>

          <Box p="sm" style={{ border: `1px solid ${color("border")}`, borderRadius: '4px' }}>
            <Group justify="space-between">
              <Group gap="sm">
                <Checkbox id="item-1" />
                <Text>{t`Monthly Revenue Dashboard`}</Text>
                <Badge>Dashboard</Badge>
              </Group>
              <Text size="sm" c={color("text-medium")}>Updated 2 days ago</Text>
            </Group>
          </Box>

          <Box p="sm" style={{ border: `1px solid ${color("border")}`, borderRadius: '4px' }}>
            <Group justify="space-between">
              <Group gap="sm">
                <Checkbox id="item-2" />
                <Text>{t`Customer Segmentation`}</Text>
                <Badge>Question</Badge>
              </Group>
              <Text size="sm" c={color("text-medium")}>Updated 4 days ago</Text>
            </Group>
          </Box>

          <Box p="sm" style={{ border: `1px solid ${color("border")}`, borderRadius: '4px' }}>
            <Group justify="space-between">
              <Group gap="sm">
                <Checkbox id="item-3" />
                <Text>{t`Product Analytics`}</Text>
                <Badge>Dashboard</Badge>
              </Group>
              <Text size="sm" c={color("text-medium")}>Updated 1 week ago</Text>
            </Group>
          </Box>
        </Stack>

        <Group justify="space-between" mt="xl">
          <Text size="sm" c={color("text-medium")}>{t`Showing 3 of 24 items`}</Text>
          <Group gap="sm">
            <Button variant="subtle" disabled size="sm">{t`Previous`}</Button>
            <Button variant="subtle" size="sm">{t`Next`}</Button>
          </Group>
        </Group>
      </Card>

      {/* Dropdown Selection Pattern */}
      <Card p="xl" mt="2rem" bg={color("bg-light")} withBorder shadow="none">
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
      <Card p="xl" mt="2rem" mb="2rem" bg={color("bg-light")} withBorder shadow="none">
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
