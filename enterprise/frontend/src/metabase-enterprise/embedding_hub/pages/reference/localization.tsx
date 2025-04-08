import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { getApplicationName } from "metabase/selectors/whitelabel";
import {
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Group,
  Radio,
  Select,
  Stack,
  Switch,
  Text,
  Title,
} from "metabase/ui";

export function LocalizationReferencePage() {
  // Mock data to simulate available locales and timezones
  const mockLocales = [
    { value: "en", label: "English" },
    { value: "es", label: "Spanish" },
    { value: "fr", label: "French" },
    { value: "de", label: "German" },
  ];

  const mockTimezones = [
    { value: "", label: t`Database Default` },
    { value: "UTC", label: "UTC" },
    { value: "US/Eastern", label: "US/Eastern" },
    { value: "US/Pacific", label: "US/Pacific" },
    { value: "Europe/London", label: "Europe/London" },
  ];

  const weekdays = [
    { value: "sunday", label: t`Sunday` },
    { value: "monday", label: t`Monday` },
    { value: "tuesday", label: t`Tuesday` },
    { value: "wednesday", label: t`Wednesday` },
    { value: "thursday", label: t`Thursday` },
    { value: "friday", label: t`Friday` },
    { value: "saturday", label: t`Saturday` },
  ];

  return (
    <>
      <Title>{t`Localization Settings Reference`}</Title>
      <Text mb="xl">
        {/* eslint-disable-next-line no-literal-metabase-strings -- This is a reference implementation */}
        {t(
          "This page demonstrates the localization settings UI patterns for " +
            getApplicationName() +
            " admin interfaces.",
        )}
      </Text>

      {/* Instance Language Section */}
      <Card p="xl" mt="xl" bg={color("bg-light")} withBorder shadow="none">
        <Title order={2} mb="xs">{t`Default Language`}</Title>
        <Text mb="lg">
          {/* eslint-disable-next-line no-literal-metabase-strings -- This is a reference implementation */}
          {t(
            "Set the default language for this " +
              getApplicationName() +
              " instance across the UI, system emails, and alerts.",
          )}
        </Text>
        <Divider mb="xl" />

        <Stack gap="lg">
          <Select
            label={t`Instance language`}
            description={
              /* eslint-disable-next-line no-literal-metabase-strings -- This is a reference implementation */
              t(
                "The default language for all users across the " +
                  getApplicationName() +
                  " UI, system emails, and alerts. Users can individually override this default language from their own account settings.",
              )
            }
            placeholder="Select a language"
            defaultValue="en"
            data={mockLocales}
          />
        </Stack>

        <Box mt="xl">
          <Button>{t`Save changes`}</Button>
        </Box>
      </Card>

      {/* Timezone Section */}
      <Card p="xl" mt="2rem" bg={color("bg-light")} withBorder shadow="none">
        <Title order={2} mb="xs">{t`Report Timezone`}</Title>
        <Text mb="lg">{t`Set the default timezone for displaying dates and times in reports.`}</Text>
        <Divider mb="xl" />

        <Stack gap="lg">
          <Select
            label={t`Report Timezone`}
            description={
              <>
                <Text
                  size="sm"
                  mb="xs"
                >{t`Connection timezone to use when executing queries. Defaults to system timezone.`}</Text>
                <Text size="sm">{t`Not all databases support timezones, in which case this setting won't take effect.`}</Text>
              </>
            }
            placeholder="Select a timezone"
            defaultValue=""
            data={mockTimezones}
            searchable
          />

          <Box>
            <Text fw={600} mb="sm">{t`Supported Databases`}</Text>
            <Box p="md" bg={color("bg-medium")} style={{ borderRadius: "4px" }}>
              <Stack gap="xs">
                <Group gap="xs">
                  <Badge>BigQuery</Badge>
                  <Badge>Druid</Badge>
                  <Badge>MySQL</Badge>
                  <Badge>Oracle</Badge>
                </Group>
                <Group gap="xs">
                  <Badge>PostgreSQL</Badge>
                  <Badge>Presto</Badge>
                  <Badge>Redshift</Badge>
                  <Badge>Vertica</Badge>
                </Group>
              </Stack>
            </Box>
          </Box>
        </Stack>

        <Box mt="xl">
          <Button>{t`Save changes`}</Button>
        </Box>
      </Card>

      {/* First Day of Week Section */}
      <Card p="xl" mt="2rem" bg={color("bg-light")} withBorder shadow="none">
        <Title order={2} mb="xs">{t`First Day of the Week`}</Title>
        <Text mb="lg">{t`Set the first day of the week for calendar views and date functions.`}</Text>
        <Divider mb="xl" />

        <Select
          label={t`First day of the week`}
          description={t`Setting the first day of the week affects things like grouping by week and filtering in questions. This setting doesn't affect SQL queries.`}
          defaultValue="sunday"
          data={weekdays}
        />

        <Box mt="xl">
          <Button>{t`Save changes`}</Button>
        </Box>
      </Card>

      {/* Date and Time Formatting Section */}
      <Card p="xl" mt="2rem" bg={color("bg-light")} withBorder shadow="none">
        <Title order={2} mb="xs">{t`Date and Time Formatting`}</Title>
        <Text mb="lg">{t`Configure how dates and times should be displayed throughout the application.`}</Text>
        <Divider mb="xl" />

        <Stack gap="xl">
          <Box>
            <Text fw={600} mb="xs">{t`Date Style`}</Text>
            <Text size="sm" mb="sm" c={color("text-medium")}>
              {/* eslint-disable-next-line no-literal-metabase-strings -- This is a reference implementation */}
              {t(
                "How would you like dates to be displayed throughout " +
                  getApplicationName() +
                  "?",
              )}
            </Text>
            <Group>
              <Button variant="outline">MM/DD/YYYY</Button>
              <Button variant="outline">DD/MM/YYYY</Button>
              <Button variant="filled">YYYY-MM-DD</Button>
            </Group>
          </Box>

          <Box>
            <Text fw={600} mb="xs">{t`Date Separators`}</Text>
            <Text size="sm" mb="sm" c={color("text-medium")}>
              {t`Choose the separator for dates.`}
            </Text>
            <Group>
              <Button variant="outline">/</Button>
              <Button variant="filled">-</Button>
              <Button variant="outline">.</Button>
            </Group>
          </Box>

          <Switch
            label={t`Abbreviate names of days and months`}
            description={t`When enabled, displays "Jan" instead of "January" and "Mon" instead of "Monday".`}
          />

          <Box>
            <Text fw={600} mb="xs">{t`Time Style`}</Text>
            <Text size="sm" mb="sm" c={color("text-medium")}>
              {t`Choose 12 or 24-hour clock for displaying times.`}
            </Text>
            <Radio.Group defaultValue="12">
              <Group mt="xs">
                <Radio value="12" label={t`12-hour clock (e.g., 3:00 PM)`} />
                <Radio value="24" label={t`24-hour clock (e.g., 15:00)`} />
              </Group>
            </Radio.Group>
          </Box>
        </Stack>

        <Box mt="xl">
          <Button>{t`Save changes`}</Button>
        </Box>
      </Card>

      {/* Number Formatting Section */}
      <Card p="xl" mt="2rem" bg={color("bg-light")} withBorder shadow="none">
        <Title order={2} mb="xs">{t`Number Formatting`}</Title>
        <Text mb="lg">{t`Configure how numbers should be displayed.`}</Text>
        <Divider mb="xl" />

        <Box>
          <Text fw={600} mb="xs">{t`Separator Style`}</Text>
          <Text size="sm" mb="sm" c={color("text-medium")}>
            {t`Choose the thousands and decimal separators.`}
          </Text>
          <Radio.Group defaultValue="comma">
            <Stack mt="xs">
              <Radio
                value="comma"
                label={
                  <Group gap="xs" align="center">
                    <Text>{t`Commas for thousands`}</Text>
                    <Badge>1,234.56</Badge>
                  </Group>
                }
              />
              <Radio
                value="period"
                label={
                  <Group gap="xs" align="center">
                    <Text>{t`Periods for thousands`}</Text>
                    <Badge>1.234,56</Badge>
                  </Group>
                }
              />
              <Radio
                value="space"
                label={
                  <Group gap="xs" align="center">
                    <Text>{t`Spaces for thousands`}</Text>
                    <Badge>1 234,56</Badge>
                  </Group>
                }
              />
            </Stack>
          </Radio.Group>
        </Box>

        <Box mt="xl">
          <Button>{t`Save changes`}</Button>
        </Box>
      </Card>

      {/* Currency Formatting Section */}
      <Card
        p="xl"
        mt="2rem"
        mb="2rem"
        bg={color("bg-light")}
        withBorder
        shadow="none"
      >
        <Title order={2} mb="xs">{t`Currency Formatting`}</Title>
        <Text mb="lg">{t`Configure how currency values should be displayed.`}</Text>
        <Divider mb="xl" />

        <Stack gap="xl">
          <Select
            label={t`Unit of Currency`}
            description={t`The default currency to use when displaying monetary values.`}
            placeholder="Select a currency"
            defaultValue="USD"
            data={
              [
                { value: "USD", label: "US Dollar ($)" },
                { value: "EUR", label: "Euro (€)" },
                { value: "GBP", label: "British Pound (£)" },
                { value: "JPY", label: "Japanese Yen (¥)" },
              ] as Array<{ value: string; label: string }>
            }
            searchable
          />

          <Box>
            <Text fw={600} mb="xs">{t`Currency Label Style`}</Text>
            <Radio.Group defaultValue="symbol">
              <Stack mt="xs">
                <Radio value="symbol" label={t`Symbol ($)`} />
                <Radio value="code" label={t`Code (USD)`} />
                <Radio value="name" label={t`Name (US Dollar)`} />
              </Stack>
            </Radio.Group>
          </Box>

          <Box>
            <Text fw={600} mb="xs">{t`Currency Display Location`}</Text>
            <Radio.Group defaultValue="header">
              <Stack mt="xs">
                <Radio value="header" label={t`In column header only`} />
                <Radio value="value" label={t`Next to each value`} />
              </Stack>
            </Radio.Group>
          </Box>
        </Stack>

        <Box mt="xl">
          <Button>{t`Save changes`}</Button>
        </Box>
      </Card>
    </>
  );
}
