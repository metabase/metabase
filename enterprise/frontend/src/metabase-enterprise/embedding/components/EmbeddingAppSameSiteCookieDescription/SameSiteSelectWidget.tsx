import { useMemo, useState } from "react";
import { t } from "ttag";

import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { SetByEnvVarWrapper } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { useAdminSetting } from "metabase/api/utils";
import { Box, Button, Group, Icon, Menu, Stack, Text } from "metabase/ui";
import type { SessionCookieSameSite } from "metabase-types/api";

import { EmbeddingAppSameSiteCookieDescription } from "./EmbeddingAppSameSiteCookieDescription";

const getSameSiteOptions = (): Options[] => [
  {
    value: "lax",
    name: t`Lax (default)`,
    description: t`Allows cookies to be sent when a user is navigating to the origin site from an external site (like when following a link).`,
  },
  {
    value: "strict",
    name: t`Strict (not recommended)`,
    // eslint-disable-next-line no-literal-metabase-strings -- admin settings
    description: t`Never allows cookies to be sent on a cross-site request. Warning: this will prevent users from following external links to Metabase.`,
  },
  {
    value: "none",
    name: t`None`,
    description: t`Allows all cross-site requests. Incompatible with most Safari and iOS-based browsers.`,
  },
];

interface Options {
  value: SessionCookieSameSite;
  name: string;
  description: string;
}

const DEFAULT_SAME_SITE_VALUE = "lax";
export function SameSiteSelectWidget() {
  const [opened, setOpened] = useState(false);
  const { value, updateSetting, settingDetails } = useAdminSetting(
    "session-cookie-samesite",
  );

  const SAME_SITE_OPTIONS = useMemo(getSameSiteOptions, []);

  const selectedValue = value ?? DEFAULT_SAME_SITE_VALUE;
  const selectedOption = SAME_SITE_OPTIONS.find(
    ({ value }) => value === selectedValue,
  );

  const handleChange = (newValue: SessionCookieSameSite) => {
    updateSetting({
      key: "session-cookie-samesite",
      value: newValue,
    });
  };

  return (
    <SetByEnvVarWrapper
      settingDetails={settingDetails}
      settingKey="session-cookie-samesite"
    >
      <Stack gap="md">
        <SettingHeader
          id="session-cookie-samesite"
          title={t`SameSite cookie setting`}
          description={<EmbeddingAppSameSiteCookieDescription />}
        />
        <Box>
          <Menu
            opened={opened}
            onChange={setOpened}
            position="bottom-start"
            shadow="sm"
          >
            <Menu.Target>
              <Button variant={opened ? "outline" : "default"}>
                <Group justify="space-between" miw="10rem">
                  <span>{selectedOption?.name}</span>
                  <Icon name="chevrondown" size="12" />
                </Group>
              </Button>
            </Menu.Target>

            <Menu.Dropdown>
              {SAME_SITE_OPTIONS.map(({ value, name, description }) => (
                <Menu.Item
                  key={value}
                  onClick={() => handleChange(value)}
                  maw="21rem"
                >
                  <Text>{name}</Text>
                  <Text c="text-light">{description}</Text>
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        </Box>
      </Stack>
    </SetByEnvVarWrapper>
  );
}
