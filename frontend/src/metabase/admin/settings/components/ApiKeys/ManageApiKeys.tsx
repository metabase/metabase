import cx from "classnames";
import { useState, useMemo } from "react";
import { t } from "ttag";

import { useListApiKeysQuery } from "metabase/api";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { formatDateTimeWithUnit } from "metabase/lib/formatting/date";
import { Stack, Title, Text, Button, Group, Icon } from "metabase/ui";
import { getThemeOverrides } from "metabase/ui/theme";
import type { ApiKey } from "metabase-types/api";

import { CreateApiKeyModal } from "./CreateApiKeyModal";
import { DeleteApiKeyModal } from "./DeleteApiKeyModal";
import { EditApiKeyModal } from "./EditApiKeyModal";
import { formatMaskedKey } from "./utils";

const { fontFamilyMonospace } = getThemeOverrides();

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
  error?: unknown;
}) {
  return (
    <Stack data-testid="api-keys-table" pb="lg">
      <table className={cx(AdminS.ContentTable, CS.borderBottom)}>
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
            <tr key={apiKey.id} className={CS.borderBottom}>
              <td className={CS.textBold} style={{ maxWidth: 400 }}>
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
                    className={CS.cursorPointer}
                    onClick={() => {
                      setActiveApiKey(apiKey);
                      setModal("edit");
                    }}
                  />
                  <Icon
                    name="trash"
                    className={CS.cursorPointer}
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

  const { data: apiKeys, error, isLoading } = useListApiKeysQuery();

  const sortedApiKeys = useMemo(() => {
    if (!apiKeys) {
      return;
    }
    return [...apiKeys].sort((a, b) => a.name.localeCompare(b.name));
  }, [apiKeys]);

  const handleClose = () => setModal(null);

  const tableIsEmpty = !isLoading && !error && apiKeys?.length === 0;

  return (
    <>
      <ApiKeyModals
        onClose={handleClose}
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
          loading={isLoading}
          error={error}
          apiKeys={sortedApiKeys}
          setActiveApiKey={setActiveApiKey}
          setModal={setModal}
        />
      </Stack>
    </>
  );
};

function ApiKeyModals({
  onClose,
  modal,
  activeApiKey,
}: {
  onClose: () => void;
  modal: Modal;
  activeApiKey: ApiKey | null;
}) {
  if (modal === "create") {
    return <CreateApiKeyModal onClose={onClose} />;
  }

  if (modal === "edit" && activeApiKey) {
    return <EditApiKeyModal onClose={onClose} apiKey={activeApiKey} />;
  }

  if (modal === "delete" && activeApiKey) {
    return <DeleteApiKeyModal apiKey={activeApiKey} onClose={onClose} />;
  }

  return null;
}
