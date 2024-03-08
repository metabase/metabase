import { useEffect, useState } from "react";
import { useAsyncFn } from "react-use";
import { t } from "ttag";

const { fontFamilyMonospace } = getThemeOverrides();

import Breadcrumbs from "metabase/components/Breadcrumbs";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import { formatDateTimeWithUnit } from "metabase/lib/formatting/date";
import { ApiKeysApi } from "metabase/services";
import { Stack, Title, Text, Button, Group, Icon } from "metabase/ui";
import { getThemeOverrides } from "metabase/ui/theme";
import type { ApiKey } from "metabase-types/api";

import { CreateApiKeyModal } from "./CreateApiKeyModal";
import { DeleteApiKeyModal } from "./DeleteApiKeyModal";
import { EditApiKeyModal } from "./EditApiKeyModal";
import { formatMaskedKey } from "./utils";

type Modal = null | "create" | "edit" | "delete";

function EmptyTableWarning({ onCreate }: { onCreate: () => void }) {
  return (
    <Stack mt="xl" align="center" justify="center" spacing="sm">
      <Title>{t`No API keys here yet`}</Title>
      <Text color="text.1" mb="md">
        {t`You can create an API key to make API calls programatically.`}
      </Text>
      <Button key="create-key-button" variant="filled" onClick={onCreate}>
        {t`Create API Key`}
      </Button>
    </Stack>
  );
}

function ApiKeysTable({
  apiKeys,
  setActiveApiKey,
  setModal,
  loading,
  error,
}: {
  apiKeys?: ApiKey[];
  setActiveApiKey: (apiKey: ApiKey) => void;
  setModal: (modal: Modal) => void;
  loading: boolean;
  error?: Error;
}) {
  return (
    <Stack data-testid="api-keys-table" pb="lg">
      <table className="ContentTable border-bottom">
        <thead>
          <tr>
            <th>{t`Key name`}</th>
            <th>{t`Group`}</th>
            <th>{t`Key`}</th>
            <th>{t`Last modified by`}</th>
            <th>{t`Last modified on`}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {apiKeys?.map(apiKey => (
            <tr key={apiKey.id} className="border-bottom">
              <td className="text-bold" style={{ maxWidth: 400 }}>
                <Ellipsified>{apiKey.name}</Ellipsified>
              </td>
              <td>{apiKey.group.name}</td>
              <td>
                <Text ff={fontFamilyMonospace as string}>
                  {formatMaskedKey(apiKey.masked_key)}
                </Text>
              </td>
              <td>{apiKey.updated_by.common_name}</td>
              <td>{formatDateTimeWithUnit(apiKey.updated_at, "minute")}</td>
              <td>
                <Group spacing="md">
                  <Icon
                    name="pencil"
                    className="cursor-pointer"
                    onClick={() => {
                      setActiveApiKey(apiKey);
                      setModal("edit");
                    }}
                  />
                  <Icon
                    name="trash"
                    className="cursor-pointer"
                    onClick={() => {
                      setActiveApiKey(apiKey);
                      setModal("delete");
                    }}
                  />
                </Group>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <LoadingAndErrorWrapper loading={loading} error={error}>
        {apiKeys?.length === 0 && (
          <EmptyTableWarning onCreate={() => setModal("create")} />
        )}
      </LoadingAndErrorWrapper>
    </Stack>
  );
}

export const ManageApiKeys = () => {
  const [modal, setModal] = useState<Modal>(null);
  const [activeApiKey, setActiveApiKey] = useState<null | ApiKey>(null);

  const [{ value: apiKeys, loading, error }, refreshList] = useAsyncFn(
    (): Promise<ApiKey[]> => ApiKeysApi.list(),
    [],
  );

  const handleClose = () => setModal(null);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const tableIsEmpty = !loading && !error && apiKeys?.length === 0;

  return (
    <>
      <ApiKeyModals
        onClose={handleClose}
        refreshList={refreshList}
        modal={modal}
        activeApiKey={activeApiKey}
      />
      <Stack pl="md" spacing="lg">
        <Breadcrumbs
          crumbs={[
            [t`Authentication`, "/admin/settings/authentication"],
            [t`API Keys`],
          ]}
        />
        <Group
          align="end"
          position="apart"
          data-testid="api-keys-settings-header"
        >
          <Stack>
            <Title>{t`Manage API Keys`}</Title>
            {!tableIsEmpty && (
              <Text color="text-medium">{t`Allow users to use the API keys to authenticate their API calls.`}</Text>
            )}
          </Stack>
          <Button
            variant="filled"
            onClick={() => setModal("create")}
          >{t`Create API Key`}</Button>
        </Group>
        <ApiKeysTable
          loading={loading}
          error={error}
          apiKeys={apiKeys?.sort((a, b) => a.name.localeCompare(b.name))}
          setActiveApiKey={setActiveApiKey}
          setModal={setModal}
        />
      </Stack>
    </>
  );
};

function ApiKeyModals({
  onClose,
  refreshList,
  modal,
  activeApiKey,
}: {
  onClose: () => void;
  refreshList: () => void;
  modal: Modal;
  activeApiKey: ApiKey | null;
}) {
  if (modal === "create") {
    return <CreateApiKeyModal onClose={onClose} refreshList={refreshList} />;
  }

  if (modal === "edit" && activeApiKey) {
    return (
      <EditApiKeyModal
        onClose={onClose}
        refreshList={refreshList}
        apiKey={activeApiKey}
      />
    );
  }

  if (modal === "delete" && activeApiKey) {
    return (
      <DeleteApiKeyModal
        apiKey={activeApiKey}
        onClose={onClose}
        refreshList={refreshList}
      />
    );
  }

  return null;
}
