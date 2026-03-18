import { useEffect } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { useSetting } from "metabase/common/hooks";
import { useDispatch } from "metabase/lib/redux";
import { Accordion, Stack, Text, Title } from "metabase/ui";

import { MetabotNavPane } from "./MetabotNavPane";
import { MetabotProviderSection } from "./MetabotProviderSection";

export function MetabotSetup() {
  const dispatch = useDispatch();
  const isHosted = useSetting("is-hosted?");

  useEffect(() => {
    if (isHosted) {
      dispatch(push("/admin/metabot/"));
    }
  }, [dispatch, isHosted]);

  return (
    <AdminSettingsLayout sidebar={<MetabotNavPane />}>
      <SettingsSection title="Configure Metabot">
        <Accordion
          multiple
          defaultValue={["provider", "health", "semantic"]}
          variant="separated"
        >
          <Accordion.Item value="provider">
            <Accordion.Control>
              <Title order={4}>{t`Connect to AI Provider`}</Title>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="md" p="md">
                <Text size="sm" c="text-secondary">
                  {t`Select your AI provider and configure your API key to get started with Metabot.`}
                </Text>
                <MetabotProviderSection />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </SettingsSection>
    </AdminSettingsLayout>
  );
}
