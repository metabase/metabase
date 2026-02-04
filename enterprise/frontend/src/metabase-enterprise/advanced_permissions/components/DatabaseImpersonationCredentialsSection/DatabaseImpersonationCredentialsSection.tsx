import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  Description,
  Error,
  Label,
} from "metabase/admin/databases/components/DatabaseFeatureComponents";
import {
  DatabaseInfoSection,
  DatabaseInfoSectionDivider,
} from "metabase/admin/databases/components/DatabaseInfoSection";
import { skipToken } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { useToast } from "metabase/common/hooks/use-toast";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import {
  Badge,
  Box,
  Button,
  Flex,
  Group,
  PasswordInput,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "metabase/ui";
import {
  useDeleteImpersonationCredentialMutation,
  useListImpersonationCredentialsQuery,
  useUpsertImpersonationCredentialMutation,
} from "metabase-enterprise/api";
import type {
  Database,
  DatabaseImpersonationCredential,
  ImpersonationCredentialAuthType,
  UpsertDatabaseImpersonationCredentialRequest,
} from "metabase-types/api";

type CredentialFormState = {
  mode: "create" | "edit";
  id?: number;
  key: string;
  auth_type: ImpersonationCredentialAuthType;
  token: string;
  oauth_client_id: string;
  oauth_secret: string;
};

const createEmptyForm = (): CredentialFormState => ({
  mode: "create",
  key: "",
  auth_type: "pat",
  token: "",
  oauth_client_id: "",
  oauth_secret: "",
});

const getAuthTypeLabel = (authType: ImpersonationCredentialAuthType) =>
  authType === "oauth-m2m" ? t`OAuth M2M` : t`PAT`;

export const DatabaseImpersonationCredentialsSection = ({
  database,
}: {
  database: Database;
}) => {
  const authTypeOptions = useMemo(
    () =>
      [
        { value: "pat", label: t`Personal access token (PAT)` },
        { value: "oauth-m2m", label: t`OAuth M2M` },
      ] as const,
    [],
  );
  const isAdmin = useSelector(getUserIsAdmin);
  const [sendToast] = useToast();

  const supportsCredentials = database.features?.includes(
    "connection-impersonation/credentials",
  );
  const shouldShowSection =
    supportsCredentials && database.engine === "databricks";

  const credentialsQuery = useListImpersonationCredentialsQuery(
    shouldShowSection ? { db_id: database.id } : skipToken,
  );
  const credentials = credentialsQuery.data ?? [];

  const [upsertCredential, upsertState] =
    useUpsertImpersonationCredentialMutation();
  const [deleteCredential, deleteState] =
    useDeleteImpersonationCredentialMutation();

  const [formState, setFormState] = useState<CredentialFormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<DatabaseImpersonationCredential | null>(null);

  const isEditing = formState?.mode === "edit";
  const isSaving = upsertState.isLoading;

  const canSubmit = useMemo(() => {
    if (!formState) {
      return false;
    }

    const trimmedKey = formState.key.trim();
    if (!trimmedKey) {
      return false;
    }

    if (formState.auth_type === "pat") {
      return Boolean(formState.token.trim());
    }

    return (
      Boolean(formState.oauth_client_id.trim()) &&
      Boolean(formState.oauth_secret.trim())
    );
  }, [formState]);

  if (!shouldShowSection) {
    return null;
  }

  const startCreate = () => {
    setFormError(null);
    setFormState(createEmptyForm());
  };

  const startEdit = (credential: DatabaseImpersonationCredential) => {
    setFormError(null);
    setFormState({
      mode: "edit",
      id: credential.id,
      key: credential.key,
      auth_type: credential.auth_type,
      token: "",
      oauth_client_id: credential.details?.oauth_client_id ?? "",
      oauth_secret: "",
    });
  };

  const resetForm = () => {
    setFormError(null);
    setFormState(null);
  };

  const handleSubmit = async () => {
    if (!formState) {
      return;
    }

    setFormError(null);

    try {
      const payload: UpsertDatabaseImpersonationCredentialRequest = {
        db_id: database.id,
        key: formState.key.trim(),
        auth_type: formState.auth_type,
      };

      if (formState.auth_type === "pat") {
        payload.token = formState.token;
      } else {
        payload.oauth_client_id = formState.oauth_client_id;
        payload.oauth_secret = formState.oauth_secret;
      }

      await upsertCredential(payload).unwrap();

      sendToast({
        message: isEditing
          ? t`Impersonation credential updated`
          : t`Impersonation credential added`,
      });
      resetForm();
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      await deleteCredential({
        id: deleteTarget.id,
        db_id: database.id,
      }).unwrap();
      sendToast({ message: t`Impersonation credential removed` });
      setDeleteTarget(null);
    } catch (error) {
      sendToast({ message: getErrorMessage(error) });
    }
  };

  const authTypeInfo =
    formState?.auth_type === "oauth-m2m"
      ? t`Provide OAuth client credentials for Databricks M2M auth.`
      : t`Provide a Databricks personal access token (PAT).`;

  return (
    <>
      <DatabaseInfoSection
        name={t`Impersonation credentials`}
        description={t`Store Databricks credentials keyed by user attribute values for connection impersonation.`}
        data-testid="database-impersonation-credentials-section"
      >
        <Stack gap="lg">
          <Flex align="center" justify="space-between" gap="md">
            <Text fw="bold">{t`Credential profiles`}</Text>
            <Tooltip
              label={
                isAdmin
                  ? undefined
                  : t`Only admins can manage impersonation credentials.`
              }
              disabled={isAdmin}
            >
              <Box>
                <Button onClick={startCreate} disabled={!isAdmin}>
                  {t`Add credential`}
                </Button>
              </Box>
            </Tooltip>
          </Flex>

          {credentialsQuery.error ? (
            <Error>{getErrorMessage(credentialsQuery.error)}</Error>
          ) : null}

          {credentialsQuery.isLoading ? (
            <Text>{t`Loading credentials…`}</Text>
          ) : credentials.length === 0 ? (
            <Description>{t`No impersonation credentials configured yet.`}</Description>
          ) : (
            <Stack gap="sm">
              {credentials.map((credential, index) => {
                const isLast = index === credentials.length - 1;
                const secondaryText =
                  credential.auth_type === "oauth-m2m"
                    ? t`OAuth client ID: ${credential.details?.oauth_client_id ?? ""}`
                    : t`PAT stored`;

                return (
                  <Box
                    key={credential.id}
                    py="sm"
                    style={{
                      borderBottom: isLast
                        ? undefined
                        : "1px solid var(--mb-color-border)",
                    }}
                  >
                    <Flex align="center" justify="space-between" gap="md">
                      <Stack gap={4}>
                        <Flex align="center" gap="xs" wrap="wrap">
                          <Text fw="600">{credential.key}</Text>
                          <Badge variant="light" size="sm">
                            {getAuthTypeLabel(credential.auth_type)}
                          </Badge>
                        </Flex>
                        <Text c="text-secondary" size="sm">
                          {secondaryText}
                        </Text>
                      </Stack>
                      <Group gap="xs">
                        <Button
                          variant="subtle"
                          size="xs"
                          onClick={() => startEdit(credential)}
                          disabled={!isAdmin}
                        >
                          {t`Edit`}
                        </Button>
                        <Button
                          variant="subtle"
                          color="danger"
                          size="xs"
                          onClick={() => setDeleteTarget(credential)}
                          disabled={!isAdmin}
                        >
                          {t`Remove`}
                        </Button>
                      </Group>
                    </Flex>
                  </Box>
                );
              })}
            </Stack>
          )}

          {formState ? (
            <>
              <DatabaseInfoSectionDivider condensed />

              <Stack gap="sm">
                <Text fw="bold">
                  {isEditing
                    ? t`Update credential`
                    : t`Add a credential profile`}
                </Text>
                <Description>{authTypeInfo}</Description>

                <Stack gap="xs">
                  <Label htmlFor="impersonation-credential-key">
                    {t`User attribute value`}
                  </Label>
                  <TextInput
                    id="impersonation-credential-key"
                    placeholder={t`e.g. analytics-team`}
                    value={formState.key}
                    disabled={isEditing}
                    onChange={(event) =>
                      setFormState({
                        ...formState,
                        key: event.currentTarget.value,
                      })
                    }
                  />
                  <Description>
                    {t`This must match the user attribute value used for impersonation.`}
                  </Description>
                </Stack>

                <Stack gap="xs">
                  <Label htmlFor="impersonation-credential-auth-type">
                    {t`Authentication type`}
                  </Label>
                  <Select
                    id="impersonation-credential-auth-type"
                    data={authTypeOptions}
                    value={formState.auth_type}
                    onChange={(value) =>
                      value &&
                      setFormState({
                        ...formState,
                        auth_type: value as ImpersonationCredentialAuthType,
                        token: "",
                        oauth_client_id: "",
                        oauth_secret: "",
                      })
                    }
                    disabled={isEditing}
                  />
                </Stack>

                {formState.auth_type === "pat" ? (
                  <Stack gap="xs">
                    <Label htmlFor="impersonation-credential-token">
                      {t`Databricks PAT`}
                    </Label>
                    <PasswordInput
                      id="impersonation-credential-token"
                      placeholder={t`Paste the PAT`}
                      value={formState.token}
                      onChange={(event) =>
                        setFormState({
                          ...formState,
                          token: event.currentTarget.value,
                        })
                      }
                    />
                    <Description>
                      {t`Tokens are stored securely and cannot be viewed after saving.`}
                    </Description>
                  </Stack>
                ) : (
                  <Stack gap="xs">
                    <Label htmlFor="impersonation-credential-oauth-client-id">
                      {t`OAuth client ID`}
                    </Label>
                    <TextInput
                      id="impersonation-credential-oauth-client-id"
                      placeholder={t`Enter the OAuth client ID`}
                      value={formState.oauth_client_id}
                      onChange={(event) =>
                        setFormState({
                          ...formState,
                          oauth_client_id: event.currentTarget.value,
                        })
                      }
                    />
                    <Label htmlFor="impersonation-credential-oauth-secret">
                      {t`OAuth client secret`}
                    </Label>
                    <PasswordInput
                      id="impersonation-credential-oauth-secret"
                      placeholder={t`Paste the OAuth secret`}
                      value={formState.oauth_secret}
                      onChange={(event) =>
                        setFormState({
                          ...formState,
                          oauth_secret: event.currentTarget.value,
                        })
                      }
                    />
                  </Stack>
                )}

                {formError ? <Error>{formError}</Error> : null}

                <Flex align="center" justify="flex-end" gap="sm" mt="xs">
                  <Button
                    variant="subtle"
                    onClick={resetForm}
                    disabled={isSaving}
                  >
                    {t`Cancel`}
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={!isAdmin || !canSubmit || isSaving}
                  >
                    {isEditing ? t`Update credential` : t`Save credential`}
                  </Button>
                </Flex>
              </Stack>
            </>
          ) : null}
        </Stack>
      </DatabaseInfoSection>

      <ConfirmModal
        opened={Boolean(deleteTarget)}
        title={t`Remove credential?`}
        message={
          deleteTarget
            ? t`This will delete the stored secret for ${deleteTarget.key}.`
            : undefined
        }
        confirmButtonText={t`Remove`}
        confirmButtonProps={{
          color: "danger",
          disabled: deleteState.isLoading,
        }}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
};
