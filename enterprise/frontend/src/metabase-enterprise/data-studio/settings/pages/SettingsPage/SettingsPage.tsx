import { useState } from "react";
import { t } from "ttag";

import { useListAnalystsQuery } from "metabase/api";
import { Button, Flex, Icon, Stack, Text } from "metabase/ui";
import { DataStudioBreadcrumbs } from "metabase-enterprise/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase-enterprise/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase-enterprise/data-studio/common/components/PaneHeader";
import { ListLoadingState } from "metabase-enterprise/transforms/components/ListLoadingState";

import { AnalystsTable } from "./AnalystsTable";
import { InviteAnalystsModal } from "./InviteAnalystsModal";
import S from "./SettingsPage.module.css";

export function SettingsPage() {
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const { data: analystsData, isLoading } = useListAnalystsQuery();

  const analysts = analystsData?.data ?? [];

  return (
    <PageContainer data-testid="data-studio-settings" gap={0}>
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Settings`}</DataStudioBreadcrumbs>
        }
        py={0}
      />
      <Stack className={S.content}>
        <Flex justify="space-between" align="center">
          <Stack gap="xs">
            <Text fw="bold" size="lg">{t`Analysts`}</Text>
            <Text c="text-secondary">
              {t`Analysts have full access to Data Studio features`}
            </Text>
          </Stack>
          <Button
            variant="filled"
            leftSection={<Icon name="add" />}
            onClick={() => setIsInviteModalOpen(true)}
          >{t`Invite`}</Button>
        </Flex>

        <Flex direction="column" flex={1} mih={0}>
          {isLoading ? (
            <ListLoadingState />
          ) : (
            <AnalystsTable analysts={analysts} />
          )}
        </Flex>
      </Stack>

      <InviteAnalystsModal
        isOpen={isInviteModalOpen}
        existingAnalystIds={new Set(analysts.map((a) => a.id))}
        onClose={() => setIsInviteModalOpen(false)}
      />
    </PageContainer>
  );
}
