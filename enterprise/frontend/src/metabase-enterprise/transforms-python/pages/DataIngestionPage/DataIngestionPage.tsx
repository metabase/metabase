import { useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { Link } from "metabase/router";
import {
  Button,
  Card,
  Center,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { useListIngestionConnectorsQuery } from "metabase-enterprise/api/transform-python";
import type { IngestionConnector } from "metabase-types/api";

import { ConnectConnectorModal } from "./ConnectConnectorModal";

export function DataIngestionPage() {
  const {
    data: connectors,
    isLoading,
    error,
  } = useListIngestionConnectorsQuery();
  const [selectedConnector, setSelectedConnector] =
    useState<IngestionConnector | null>(null);

  if (isLoading || error != null || connectors == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="data-ingestion-page">
      <PaneHeader
        title={<Title order={2}>{t`Data ingestion`}</Title>}
        breadcrumbs={
          <DataStudioBreadcrumbs>
            <Link key="transform-list" to={Urls.transformList()}>
              {t`Transforms`}
            </Link>
            {t`Data ingestion`}
          </DataStudioBreadcrumbs>
        }
      />
      <Text c="text-secondary" mb="lg">
        {t`Pull data from external services into your database.`}
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        {connectors.map((connector) => (
          <ConnectorCard
            key={connector.id}
            connector={connector}
            onConnect={() => setSelectedConnector(connector)}
          />
        ))}
      </SimpleGrid>
      {connectors.length === 0 && (
        <Text c="text-secondary">{t`No connectors are available.`}</Text>
      )}
      {selectedConnector != null && (
        <ConnectConnectorModal
          connector={selectedConnector}
          onClose={() => setSelectedConnector(null)}
        />
      )}
    </PageContainer>
  );
}

type ConnectorCardProps = {
  connector: IngestionConnector;
  onConnect: () => void;
};

function ConnectorCard({ connector, onConnect }: ConnectorCardProps) {
  return (
    <Card withBorder p="lg">
      <Stack gap="sm" h="100%">
        <Title order={4}>{connector.name}</Title>
        <Text c="text-secondary" flex={1}>
          {connector.description}
        </Text>
        <Button variant="filled" onClick={onConnect}>
          {t`Connect`}
        </Button>
      </Stack>
    </Card>
  );
}
