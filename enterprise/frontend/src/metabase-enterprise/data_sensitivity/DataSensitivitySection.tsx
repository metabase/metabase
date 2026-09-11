import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import {
  DatabaseInfoSection,
  DatabaseInfoSectionDivider,
} from "metabase/admin/databases/components/DatabaseInfoSection";
import { getErrorMessage } from "metabase/api/utils/errors";
import { AIProviderConfigurationModal } from "metabase/metabot/components/AIProviderConfigurationModal";
import { AIProviderConfigurationNotice } from "metabase/metabot/components/AIProviderConfigurationNotice";
import { useSetting } from "metabase/settings";
import { Button, Flex, Text } from "metabase/ui";
import { useClassifyDataSensitivityDatabaseMutation } from "metabase-enterprise/api";
import type {
  DataSensitivityDatabaseResult,
  Database,
} from "metabase-types/api";

import { DataSensitivityResultsModal } from "./DataSensitivityResultsModal";

export function DataSensitivitySection({ database }: { database: Database }) {
  const isMetabotEnabled = useSetting("metabot-enabled?");
  const isProviderConfigured = !!useSetting("llm-metabot-configured?");
  const [classifyDatabase, { data: result, isLoading, error }] =
    useClassifyDataSensitivityDatabaseMutation();
  const [isResultsOpen, { open: openResults, close: closeResults }] =
    useDisclosure(false);
  const [
    isProviderModalOpen,
    { open: openProviderModal, close: closeProviderModal },
  ] = useDisclosure(false);

  const canScan = isMetabotEnabled && isProviderConfigured;

  const handleScan = async () => {
    const { error } = await classifyDatabase({ id: database.id });
    if (!error) {
      openResults();
    }
  };

  return (
    <DatabaseInfoSection
      condensed
      name={t`Data sensitivity`}
      description={t`Use AI to detect columns that hold sensitive data, such as personal, financial, or health information. The scan proposes labels for review and changes nothing.`}
      data-testid="database-data-sensitivity-section"
    >
      <Flex align="center" justify="space-between" gap="xl">
        <ScanStatus
          isMetabotEnabled={isMetabotEnabled}
          isProviderConfigured={isProviderConfigured}
          isLoading={isLoading}
          error={error}
          onConfigureAi={openProviderModal}
        />
        <Button
          onClick={handleScan}
          disabled={!canScan}
          loading={isLoading}
          loaderProps={{ children: t`Scanning…` }}
          style={{ flexShrink: 0 }}
        >{t`Scan for sensitive data`}</Button>
      </Flex>

      {result && (
        <>
          <DatabaseInfoSectionDivider condensed />
          <Flex align="center" justify="space-between" gap="xl">
            <ScanSummary result={result} />
            <Button
              variant="subtle"
              onClick={openResults}
              style={{ flexShrink: 0 }}
            >{t`View results`}</Button>
          </Flex>
          <DataSensitivityResultsModal
            result={result}
            opened={isResultsOpen}
            onClose={closeResults}
          />
        </>
      )}

      <AIProviderConfigurationModal
        opened={isProviderModalOpen}
        onClose={closeProviderModal}
      />
    </DatabaseInfoSection>
  );
}

function ScanStatus({
  isMetabotEnabled,
  isProviderConfigured,
  isLoading,
  error,
  onConfigureAi,
}: {
  isMetabotEnabled: boolean;
  isProviderConfigured: boolean;
  isLoading: boolean;
  error: unknown;
  onConfigureAi: () => void;
}) {
  if (!isMetabotEnabled) {
    return (
      <Text c="text-secondary">
        {t`Metabot is disabled. Enable Metabot in the AI settings to scan for sensitive data.`}
      </Text>
    );
  }
  if (!isProviderConfigured) {
    return (
      <AIProviderConfigurationNotice
        featureName={t`sensitive data scanning`}
        onConfigureAi={onConfigureAi}
        inline
      />
    );
  }
  if (isLoading) {
    return (
      <Text c="text-secondary">
        {t`Scanning every table in this database. This can take a few minutes.`}
      </Text>
    );
  }
  if (error) {
    return (
      <Text c="error">
        {getErrorMessage(error, t`Failed to scan for sensitive data.`)}
      </Text>
    );
  }
  return (
    <Text c="text-secondary">
      {t`Scans every table in this database and proposes a sensitivity label for each column.`}
    </Text>
  );
}

function ScanSummary({ result }: { result: DataSensitivityDatabaseResult }) {
  const { counts, failed } = result;
  return (
    <Text>
      {t`${counts.fields} fields scanned: ${counts.new} new, ${counts.disagree} differ, ${counts.agree} agree.`}
      {failed > 0 && ` ${t`${failed} tables failed.`}`}
    </Text>
  );
}
