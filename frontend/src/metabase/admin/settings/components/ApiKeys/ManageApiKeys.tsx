import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { useListApiKeysQuery } from "metabase/api";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { ClientSortableTable } from "metabase/common/components/Table";
import CS from "metabase/css/core/index.css";
import { formatDateTimeWithUnit } from "metabase/lib/formatting/date";
import { Button, Group, Icon, Stack, Text, Title } from "metabase/ui";
import { getThemeOverrides } from "metabase/ui/theme";
import type { ApiKey } from "metabase-types/api";

import { CreateApiKeyModal } from "./CreateApiKeyModal";
import { DeleteApiKeyModal } from "./DeleteApiKeyModal";
import { EditApiKeyModal } from "./EditApiKeyModal";
import type { FlatApiKey } from "./utils";
import { flattenApiKey, formatMaskedKey } from "./utils";

const { fontFamilyMonospace } = getThemeOverrides();

type Modal = null | "create" | "edit" | "delete";

function EmptyTableWarning({ onCreate }: { onCreate: () => void }) {
  return (
    <Stack
      mt="xl"
      align="center"
      justify="center"
      gap="sm"
      data-testid="empty-table-warning"
    >
      <Title order={2}>{t`No API keys here yet`}</Title>
      <Text mb="md">
        {t`You can create an API key to make API calls programmatically.`}
      </Text>
      <Button key="create-key-button" variant="filled" onClick={onCreate}>
        {t`Create API key`}
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
  const flatApiKeys = useMemo(() => apiKeys?.map(flattenApiKey), [apiKeys]);

  if (loading || error) {
    return <DelayedLoadingAndErrorWrapper loading={loading} error={error} />;
  }

  if (apiKeys?.length === 0 || !apiKeys || !flatApiKeys) {
    return <EmptyTableWarning onCreate={() => setModal("create")} />;
  }

  const columns = [
    { key: "name", name: t`Key name` },
    { key: "group_name", name: t`Group` },
    { key: "masked_key", name: t`Key` },
    { key: "updated_by_name", name: t`Last modified by` },
    { key: "updated_at", name: t`Last modified on` },
    { key: "actions", name: "", sortable: false },
  ];

  return (
    <ClientSortableTable
      data-testid="api-keys-table"
      columns={columns}
      rows={flatApiKeys}
      rowRenderer={(row) => (
        <ApiKeyRow
          apiKey={row}
          setActiveApiKey={setActiveApiKey}
          setModal={setModal}
        />
      )}
    />
  );
}

const ApiKeyRow = ({
  apiKey,
  setActiveApiKey,
  setModal,
}: {
  apiKey: FlatApiKey;
  setActiveApiKey: (apiKey: ApiKey) => void;
  setModal: (modal: Modal) => void;
}) => (
  <tr>
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
      <Group gap="md" py="md">
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
);

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

  return (
    <SettingsPageWrapper title={t`API keys`}>
      <SettingsSection>
        <ApiKeyModals
          onClose={handleClose}
          modal={modal}
          activeApiKey={activeApiKey}
        />
        <Stack gap="lg">
          <Group
            justify="space-between"
            align="center"
            data-testid="api-keys-settings-header"
          >
            <Text c="text-secondary">
              {t`Allow users to use API keys to authenticate their API calls.`}
            </Text>
            <Button
              variant="filled"
              onClick={() => setModal("create")}
            >{t`Create API key`}</Button>
          </Group>
          <ApiKeysTable
            loading={isLoading}
            error={error}
            apiKeys={sortedApiKeys}
            setActiveApiKey={setActiveApiKey}
            setModal={setModal}
          />
        </Stack>
      </SettingsSection>
    </SettingsPageWrapper>
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
