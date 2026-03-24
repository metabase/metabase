import cx from "classnames";
import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import CS from "metabase/css/core/index.css";
import {
  Box,
  FileInput,
  Flex,
  Icon,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "metabase/ui";

import { MetabotNavPane } from "../MetabotNavPane";

export function MetabotCustomizationPage() {
  return (
    <AdminSettingsLayout sidebar={<MetabotNavPane />}>
      <SettingsPageWrapper title={t`Customize`} mt="xl">
        <SettingsSection
          description={t`Customize how Metabot appears to users.`}
          title={t`Identity`}
        >
          <TextInput
            label={t`Metabot's name`}
            placeholder={t`Metabot`}
            mb="sm"
          />
          <Stack gap={0}>
            <Text lh="lg" fz="md" mb="xs" fw="bold">
              {t`Metabot's icon`}
            </Text>
            <Text fz="md" c="text-secondary" lh="lg">
              {t`Upload a custom icon for Metabot. For best results, use an SVG or PNG with a transparent background.`}
            </Text>
            <Flex
              align="center"
              className={cx(CS.bordered, CS.rounded, CS.alignSelfStart)}
              gap="sm"
              mb="xl"
              mt="sm"
              p="md"
            >
              <Box
                className={cx(CS.bgLight, CS.bordered, CS.bordered, CS.rounded)}
                p="sm"
                flex="0 0 2.25rem"
              >
                <Icon name="ai" size="lg" />
              </Box>
              <FileInput
                placeholder={<Text c="text-secondary">{t`Upload`}</Text>}
                size="xs"
              />
            </Flex>
            <Textarea
              description={t`Tell Metabot how to respond. For example, "Be brief and direct" or "Be friendly and conversational."`}
              descriptionProps={{
                c: "text-secondary",
                fz: "md",
                lh: "lg",
              }}
              label={t`Tone instructions`}
              labelProps={{ lh: "lg" }}
              placeholder={t`Be friendly (but not jokey), professional, and to-the-point. Be precise and correct.`}
              minRows={15}
            />
          </Stack>
        </SettingsSection>
      </SettingsPageWrapper>
    </AdminSettingsLayout>
  );
}
