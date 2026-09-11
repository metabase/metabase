import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import {
  useListLlmProviderTypesQuery,
  useListLlmProvidersQuery,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { Button, Flex, Stack, Text } from "metabase/ui";
import type {
  LlmProviderConnection,
  LlmProviderType,
} from "metabase-types/api";

import { ProviderListSkeleton } from "./AIProviderList";
import { LlmModelPicker } from "./LlmModelPicker";
import { ProviderConnectionForm } from "./ProviderConnectionForm";
import { getAddableProviderTypes } from "./addable-provider-types";

export function AIProviderSetup({
  onDone,
  startOnConnectionForm = false,
}: {
  onDone?: () => void;
  // Callers that already have a connection but are here to add another one — the out-of-tokens flow, where the
  // managed connection exists and the point is to bring your own key alongside it.
  startOnConnectionForm?: boolean;
}) {
  const {
    data: connections = [],
    isLoading: isLoadingConnections,
    error: connectionsError,
  } = useListLlmProvidersQuery();
  const {
    data: providerTypes = [],
    isLoading: isLoadingProviderTypes,
    error: providerTypesError,
  } = useListLlmProviderTypesQuery();

  if (isLoadingConnections || isLoadingProviderTypes) {
    return <ProviderListSkeleton />;
  }

  const loadError = connectionsError ?? providerTypesError;
  if (loadError) {
    return (
      <Text c="error">
        {getErrorMessage(loadError, t`Unable to load your AI providers.`)}
      </Text>
    );
  }

  return (
    <AIProviderSetupContent
      connections={connections}
      providerTypes={providerTypes}
      startOnConnectionForm={startOnConnectionForm}
      onDone={onDone}
    />
  );
}

function AIProviderSetupContent({
  connections,
  providerTypes,
  startOnConnectionForm,
  onDone,
}: {
  connections: LlmProviderConnection[];
  providerTypes: LlmProviderType[];
  startOnConnectionForm: boolean;
  onDone?: () => void;
}) {
  const [isPickingModel, { open: pickModel }] = useDisclosure(
    !startOnConnectionForm &&
      connections.some((connection) => connection.usable),
  );

  if (isPickingModel) {
    return (
      <Stack gap="xl">
        <LlmModelPicker />
        <Flex justify="end">
          <Button variant="filled" onClick={onDone}>
            {t`Done`}
          </Button>
        </Flex>
      </Stack>
    );
  }

  return (
    <ProviderConnectionForm
      providerTypes={getAddableProviderTypes(providerTypes, connections)}
      onSaved={(saved) => {
        const providerType = providerTypes.find(
          (type) => type.type === saved?.type,
        );
        if (providerType && !providerType.managed) {
          pickModel();
        } else {
          onDone?.();
        }
      }}
    />
  );
}
