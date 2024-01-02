import { t } from "ttag";
import { useEffect, useState } from "react";
import { useAsyncFn } from "react-use";

import { Stack, Title, Text, Button, Group } from "metabase/ui";

import Breadcrumbs from "metabase/components/Breadcrumbs";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import { ApiKeysApi } from "metabase/services";
import { Icon } from "metabase/core/components/Icon";

import type { ApiKey } from "metabase-types/api";
import { formatDateTimeWithUnit } from "metabase/lib/formatting/date";

import { CreateApiKeyModal } from "./CreateApiKeyModal";
import { EditApiKeyModal } from "./EditApiKeyModal";
import { DeleteApiKeyModal } from "./DeleteApiKeyModal";

type Modal = null | "create" | "edit" | "delete";

function formatMaskedKey(maskedKey: string) {
  return maskedKey.substring(0, 4) + "...";
}

function EmptyTableWarning() {
  return (
    <Stack
      h="40rem" // TODO: how to make this fill only available window height?
      align="center"
      justify="center"
      spacing="sm"
    >
      <Title>{t`No API keys here yet`}</Title>
      <Text color="text.1">{t`Create API keys to programmatically authenticate their API calls.`}</Text>
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
    <Stack data-testid="api-keys-table">
      <table className="ContentTable border-bottom">
        <thead>
          <tr>
            <th>{t`Key name`}</th>
            <th>{t`Group`}</th>
            <th>{t`Key`}</th>
            <th>{t`Last Modified By`}</th>
            <th>{t`Last Modified On`}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {apiKeys?.map(apiKey => (
            <tr key={apiKey.id} className="border-bottom">
              <td className="text-bold">{apiKey.name}</td>
              <td>{apiKey.group.name}</td>
              <td className="text-monospace">
                {formatMaskedKey(apiKey.masked_key)}
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
        {apiKeys?.length === 0 && <EmptyTableWarning />}
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

  const isShowingEmptyTable = !loading && !error && apiKeys?.length === 0;

  return (
    <>
      {modal === "create" ? (
        <CreateApiKeyModal onClose={handleClose} refreshList={refreshList} />
      ) : modal === "edit" && activeApiKey ? (
        <EditApiKeyModal
          onClose={handleClose}
          refreshList={refreshList}
          apiKey={activeApiKey}
        />
      ) : modal === "delete" && activeApiKey ? (
        <DeleteApiKeyModal
          apiKey={activeApiKey}
          onClose={handleClose}
          refreshList={refreshList}
        />
      ) : null}
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
            {!isShowingEmptyTable && (
              <Text color="text.1">{t`Allow users to use the API keys to authenticate their API calls.`}</Text>
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
          apiKeys={apiKeys}
          setActiveApiKey={setActiveApiKey}
          setModal={setModal}
        />
      </Stack>
    </>
  );
};
