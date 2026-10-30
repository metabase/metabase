import { NotFound } from "metabase/common/components/ErrorPages";
import { useParams } from "metabase/router";
import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/settings-components";
import { Group, Icon, Stack, Text } from "metabase/ui";

import { DataAnalystsTransformsSection } from "./DataAnalystsTransformsSection";
import { getRole, isRoleId } from "./roles";

export function RolePage() {
  const { roleId } = useParams<{ roleId: string }>();

  if (!isRoleId(roleId)) {
    return <NotFound />;
  }

  const role = getRole(roleId);

  return (
    <SettingsPageWrapper title={role.name} description={role.description}>
      <SettingsSection
        title={role.capabilitiesTitle}
        titleProps={{ order: 2, size: "h4" }}
      >
        <Stack gap="lg">
          {role.capabilities.map((capability) => (
            <Group
              key={capability.label}
              gap="md"
              align="flex-start"
              wrap="nowrap"
            >
              <Icon
                name={capability.icon}
                c="core-brand"
                mt="2px"
                style={{ flexShrink: 0 }}
              />
              <Stack gap="xs">
                <Text fw="bold" lh={1.25}>
                  {capability.label}
                </Text>
                <Text c="text-secondary" lh={1.4}>
                  {capability.description}
                </Text>
              </Stack>
            </Group>
          ))}
        </Stack>
      </SettingsSection>
      <Text c="text-secondary">{role.footnote}</Text>
      {roleId === "data-analysts" && <DataAnalystsTransformsSection />}
    </SettingsPageWrapper>
  );
}
