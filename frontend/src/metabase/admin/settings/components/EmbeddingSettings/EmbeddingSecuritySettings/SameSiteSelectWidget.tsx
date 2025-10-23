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
    description: t`Allows Metabase session cookies to be shared on the same domain. Used for production instances on the same domain.`,
  },
  {
    value: "strict",
    name: t`Strict (not recommended)`,
    description: t`Does not allow Metabase session cookies to be shared with embedded instances. Use this if you do not want to enable session sharing with embedding.`,
  },
  {
    value: "none",
    name: t`None (requires HTTPS)`,
    description: t`Use "None" when your app and Metabase are hosted on different domains. Incompatible with Safari and iOS-based browsers.`,
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
      <Stack gap="xs">
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
                  <Text c="text-secondary" size="sm" lh="lg">
                    {description}
                  </Text>
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        </Box>
      </Stack>
    </SetByEnvVarWrapper>
  );
}
