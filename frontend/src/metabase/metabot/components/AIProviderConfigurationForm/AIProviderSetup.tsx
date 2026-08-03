import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import {
  useListLlmProviderTypesQuery,
  useListLlmProvidersQuery,
} from "metabase/api";
import { Button, Flex, Stack } from "metabase/ui";

import { ProviderListSkeleton } from "./AIProviderList";
import { LlmModelPicker } from "./LlmModelPicker";
import { ProviderConnectionForm } from "./ProviderConnectionForm";

export function AIProviderSetup({ onDone }: { onDone?: () => void }) {
  const { data: connections = [], isLoading: isLoadingConnections } =
    useListLlmProvidersQuery();
  const { data: providerTypes = [], isLoading: isLoadingProviderTypes } =
    useListLlmProviderTypesQuery();

  const [hasJustConnected, { open: markConnected }] = useDisclosure(false);

  if (isLoadingConnections || isLoadingProviderTypes) {
    return <ProviderListSkeleton />;
  }

  const hasUsableConnection = connections.some(
    (connection) => connection.usable,
  );

  if (hasUsableConnection || hasJustConnected) {
    return (
      <Stack gap="lg">
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
      providerTypes={providerTypes}
      onSaved={(saved) => {
        const providerType = providerTypes.find(
          (type) => type.type === saved?.type,
        );
        if (providerType && !providerType.managed) {
          markConnected();
        } else {
          onDone?.();
        }
      }}
    />
  );
}
