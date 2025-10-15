import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { useGetHealthReportQuery } from "metabase/api/health-report";
import Markdown from "metabase/common/components/Markdown";
import { Box, Flex, Loader, Stack, Text, Title } from "metabase/ui";
import { FC } from "react";
import { t } from "ttag";

export const HealthReport: FC = () => {
  const { data: { reportMarkdown } = {}, isLoading } =
    useGetHealthReportQuery();
  return (
    <SettingsPageWrapper title={t`Health`}>
      <SettingsSection>
        <Stack align="center" gap="lg" my="4.5rem">
          <Box ta="center">
            <Title c="text-primary" fz="lg">
              MetaDoctor says
            </Title>
          </Box>
          {isLoading || !reportMarkdown ? (
            <Box h={96} pos="relative" ta="center" w={96}>
              <Flex
                bottom={0}
                align="center"
                direction="row"
                gap={0}
                justify="center"
                pos="absolute"
                right={0}
                wrap="nowrap"
                bg="white"
                fz={0}
                p="sm"
                ta="center"
                style={{
                  borderRadius: "100%",
                  boxShadow: `0 1px 6px 0 var(--mb-color-shadow)`,
                }}
              >
                <Loader size="xs" ml={1} mt={1} />
              </Flex>
            </Box>
          ) : (
            <Text>
              <Markdown>{reportMarkdown}</Markdown>
            </Text>
          )}
        </Stack>
      </SettingsSection>
    </SettingsPageWrapper>
  );
};
