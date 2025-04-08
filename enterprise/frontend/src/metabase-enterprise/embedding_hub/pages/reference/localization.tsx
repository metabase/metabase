import { jt, t } from "ttag";

import { color } from "metabase/lib/colors";
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
      <Title order={1} mb="xs">{t`Localization Settings Reference`}</Title>
      <Text mb="xl">
        {jt`This page demonstrates the localization settings UI patterns for the admin interfaces.`}
      </Text>

      {/* General Localization Settings Card */}
      <Card p="xl" mt="xl" bg={color("bg-light")} withBorder shadow="none">
        <Title order={2} mb="xs">{t`General Localization Settings`}</Title>
        <Text mb="lg">
          {jt`Configure regional settings that affect how content is localized across the application.`}
        </Text>
        <Divider mb="xl" />

        <Stack gap="xl">
          {/* Instance Language Section */}
          <Box>
            <Text fw={600} mb="xs">{t`Default Language`}</Text>
            <Text size="sm" mb="sm" c={color("text-medium")}>
              {jt`The default language for all users.`}
            </Text>
            <Select
              placeholder={t`Select a language`}
              defaultValue="en"
              data={mockLocales}
            />
          </Box>

          <Divider />

          {/* Timezone Section */}
          <Box>
            <Text fw={600} mb="xs">{t`Report Timezone`}</Text>
            <Text size="sm" mb="sm" c={color("text-medium")}>
              {t`Connection timezone to use when executing queries. Defaults to system timezone.`}
            </Text>
            <Select
              placeholder={t`Select a timezone`}
              defaultValue=""
              data={mockTimezones}
              searchable
            />
            <Text size="xs" mt="xs" c={color("text-medium")}>
              {t`Not all databases support timezones, in which case this setting won't take effect.`}
            </Text>
          </Box>

          <Divider />

          {/* First Day of Week Section */}
          <Box>
            <Text fw={600} mb="xs">{t`First Day of the Week`}</Text>
            <Text size="sm" mb="sm" c={color("text-medium")}>
              {t`Setting the first day of the week affects things like grouping by week and filtering in questions. This setting doesn't affect SQL queries.`}
            </Text>
            <Select
              placeholder={t`Select first day`}
              defaultValue="sunday"
              data={weekdays}
            />
          </Box>
        </Stack>

        <Group justify="right" mt="xl">
          <Button>{t`Save changes`}</Button>
        </Group>
      </Card>

      {/* Format Settings Card */}
      <Card
        p="xl"
        mt="2rem"
        mb="2rem"
        bg={color("bg-light")}
        withBorder
        shadow="none"
      >
        <Title order={2} mb="xs">{t`Format Settings`}</Title>
        <Text mb="lg">{t`Configure how dates, times, numbers, and currency values should be displayed throughout the application.`}</Text>
        <Divider mb="xl" />

        <Stack gap="xl">
          {/* Date and Time Formatting Section */}
          <Box>
            <Text fw={600} mb="sm">{t`Date and Time Formatting`}</Text>

            <Stack gap="lg">
              <Box>
                <Text
                  fw={500}
                  mb="xs"
                  c={color("text-medium")}
                >{t`Date Style`}</Text>
                <Group>
                  <Button variant="outline">MM/DD/YYYY</Button>
                  <Button variant="outline">DD/MM/YYYY</Button>
                  <Button variant="filled">YYYY-MM-DD</Button>
                </Group>
              </Box>

              <Box>
                <Text
                  fw={500}
                  mb="xs"
                  c={color("text-medium")}
                >{t`Date Separators`}</Text>
                <Group>
                  <Button variant="outline">/</Button>
                  <Button variant="filled">-</Button>
                  <Button variant="outline">.</Button>
                </Group>
              </Box>

              <Group justify="space-between">
                <Box>
                  <Text fw={500}>{t`Abbreviate names of days and months`}</Text>
                  <Text size="sm" c={color("text-medium")}>
                    {t`When enabled, displays "Jan" instead of "January" and "Mon" instead of "Monday".`}
                  </Text>
                </Box>
                <Switch />
              </Group>

              <Box>
                <Text
                  fw={500}
                  mb="xs"
                  c={color("text-medium")}
                >{t`Time Style`}</Text>
                <Radio.Group defaultValue="12">
                  <Group mt="xs">
                    <Radio
                      value="12"
                      label={t`12-hour clock (e.g., 3:00 PM)`}
                    />
                    <Radio value="24" label={t`24-hour clock (e.g., 15:00)`} />
                  </Group>
                </Radio.Group>
              </Box>
            </Stack>
          </Box>

          <Divider />

          {/* Number Formatting Section */}
          <Box>
            <Text fw={600} mb="sm">{t`Number Formatting`}</Text>

            <Box>
              <Text
                fw={500}
                mb="xs"
                c={color("text-medium")}
              >{t`Separator Style`}</Text>
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
          </Box>

          <Divider />

          {/* Currency Formatting Section */}
          <Box>
            <Text fw={600} mb="sm">{t`Currency Formatting`}</Text>

            <Stack gap="lg">
              <Box>
                <Text
                  fw={500}
                  mb="xs"
                  c={color("text-medium")}
                >{t`Unit of Currency`}</Text>
                <Select
                  placeholder={t`Select a currency`}
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
              </Box>

              <Box>
                <Text
                  fw={500}
                  mb="xs"
                  c={color("text-medium")}
                >{t`Currency Label Style`}</Text>
                <Radio.Group defaultValue="symbol">
                  <Stack mt="xs">
                    <Radio value="symbol" label={t`Symbol ($)`} />
                    <Radio value="code" label={t`Code (USD)`} />
                    <Radio value="name" label={t`Name (US Dollar)`} />
                  </Stack>
                </Radio.Group>
              </Box>

              <Box>
                <Text
                  fw={500}
                  mb="xs"
                  c={color("text-medium")}
                >{t`Currency Display Location`}</Text>
                <Radio.Group defaultValue="header">
                  <Stack mt="xs">
                    <Radio value="header" label={t`In column header only`} />
                    <Radio value="value" label={t`Next to each value`} />
                  </Stack>
                </Radio.Group>
              </Box>
            </Stack>
          </Box>
        </Stack>

        <Group justify="right" mt="xl">
          <Button>{t`Save changes`}</Button>
        </Group>
      </Card>
    </>
  );
}
