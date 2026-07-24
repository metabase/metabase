import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useDispatch } from "metabase/redux";
import { push } from "metabase/router";
import { useTransformSupportedDbs } from "metabase/transforms/hooks/use-transform-supported-dbs";
import {
  Alert,
  Button,
  Checkbox,
  Divider,
  Group,
  Icon,
  Loader,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import {
  useCreateConnectorConnectionMutation,
  useLazyGetConnectorOauthStatusQuery,
  useLazyGetConnectorOauthUrlQuery,
} from "metabase-enterprise/api/transform-python";
import type { IngestionConnector } from "metabase-types/api";

const OAUTH_POPUP_WIDTH = 600;
const OAUTH_POPUP_HEIGHT = 700;
const OAUTH_POLL_INTERVAL_MS = 2000;

function openCenteredPopup(url: string) {
  const left = window.screenX + (window.outerWidth - OAUTH_POPUP_WIDTH) / 2;
  const top = window.screenY + (window.outerHeight - OAUTH_POPUP_HEIGHT) / 2;
  window.open(
    url,
    "mb-connector-oauth",
    `popup,width=${OAUTH_POPUP_WIDTH},height=${OAUTH_POPUP_HEIGHT},left=${left},top=${top}`,
  );
}

function useConnectorOauth(connectorId: string) {
  const [fetchOauthUrl, { isFetching: isStartingOauth }] =
    useLazyGetConnectorOauthUrlQuery();
  const [fetchOauthStatus] = useLazyGetConnectorOauthStatusQuery();
  const [oauthState, setOauthState] = useState<string | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const stateRef = useRef<string | null>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const isOauthCompleteMessage =
        event.origin === window.location.origin &&
        event.data?.type === "MB_CONNECTOR_OAUTH" &&
        stateRef.current != null &&
        event.data?.state === stateRef.current;
      if (isOauthCompleteMessage) {
        setIsAuthorized(true);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Fallback in case the popup's postMessage is missed.
  useEffect(() => {
    if (oauthState == null || isAuthorized) {
      return;
    }
    const intervalId = window.setInterval(async () => {
      const { data } = await fetchOauthStatus(oauthState);
      if (data?.ready) {
        setIsAuthorized(true);
      }
    }, OAUTH_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [oauthState, isAuthorized, fetchOauthStatus]);

  const startOauth = useCallback(async () => {
    setOauthError(null);
    try {
      const { url, state } = await fetchOauthUrl(connectorId).unwrap();
      stateRef.current = state;
      setOauthState(state);
      setIsAuthorized(false);
      openCenteredPopup(url);
    } catch (error) {
      setOauthError(getErrorMessage(error, t`Could not start authorization`));
    }
  }, [connectorId, fetchOauthUrl]);

  return { startOauth, isStartingOauth, oauthState, isAuthorized, oauthError };
}

type WizardStep = "auth" | "config";

type ConnectConnectorModalProps = {
  connector: IngestionConnector;
  onClose: () => void;
};

export function ConnectConnectorModal({
  connector,
  onClose,
}: ConnectConnectorModalProps) {
  const dispatch = useDispatch();
  const [step, setStep] = useState<WizardStep>("auth");
  const [token, setToken] = useState("");
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [databaseId, setDatabaseId] = useState<string | null>(null);
  const [schema, setSchema] = useState("");
  const [tableName, setTableName] = useState("");
  const [name, setName] = useState("");
  const [selectedStreamKeys, setSelectedStreamKeys] = useState<string[]>(() =>
    connector.streams.map((stream) => stream.key),
  );
  const [submitError, setSubmitError] = useState<string | null>(null);

  const oauth = useConnectorOauth(connector.id);
  const { transformsDatabases, isLoadingDatabases } =
    useTransformSupportedDbs();
  const [createConnection, { isLoading: isSubmitting }] =
    useCreateConnectorConnectionMutation();

  const hasToken = token.trim().length > 0;
  const canContinue = oauth.isAuthorized || hasToken;

  const configFields = connector["config-fields"];
  const hasMissingRequiredField = configFields.some(
    (field) => field.required && !configValues[field.key]?.trim(),
  );
  const selectedStreams = connector.streams.filter((stream) =>
    selectedStreamKeys.includes(stream.key),
  );
  const singleSelectedStream =
    selectedStreams.length === 1 ? selectedStreams[0] : null;
  const canSubmit =
    databaseId != null &&
    !hasMissingRequiredField &&
    selectedStreams.length > 0;

  const toggleStream = (streamKey: string, isChecked: boolean) => {
    setSelectedStreamKeys((keys) =>
      isChecked
        ? [...keys, streamKey]
        : keys.filter((key) => key !== streamKey),
    );
  };

  const handleSubmit = async () => {
    if (databaseId == null) {
      return;
    }
    setSubmitError(null);
    const config = Object.fromEntries(
      Object.entries(configValues).filter(([, value]) => value.trim() !== ""),
    );
    try {
      const transforms = await createConnection({
        connectorId: connector.id,
        config,
        auth: hasToken
          ? { token: token.trim() }
          : { "oauth-state": oauth.oauthState ?? undefined },
        streams: selectedStreams.map((stream) => stream.key),
        target: {
          database: Number(databaseId),
          ...(schema.trim() !== "" ? { schema: schema.trim() } : {}),
          // The backend only honors a custom table name for a single stream.
          ...(singleSelectedStream != null && tableName.trim() !== ""
            ? { "table-name": tableName.trim() }
            : {}),
        },
        ...(name.trim() !== "" ? { name: name.trim() } : {}),
      }).unwrap();
      onClose();
      if (transforms.length === 1) {
        dispatch(push(Urls.transform(transforms[0].id)));
      } else {
        dispatch(push(Urls.transformList()));
      }
    } catch (error) {
      setSubmitError(
        getErrorMessage(error, t`Could not create the connection`),
      );
    }
  };

  return (
    <Modal
      opened
      title={t`Connect to ${connector.name}`}
      padding="xl"
      onClose={onClose}
    >
      {step === "auth" ? (
        <Stack gap="md" mt="sm">
          {connector["oauth-configured"] && (
            <>
              <Group>
                <Button
                  variant="filled"
                  loading={oauth.isStartingOauth}
                  disabled={oauth.isAuthorized}
                  onClick={oauth.startOauth}
                >
                  {t`Connect with ${connector.name}`}
                </Button>
                {oauth.isAuthorized && (
                  <Group gap="xs">
                    <Icon name="check" c="success" />
                    <Text c="success" fw="bold">{t`Authorized`}</Text>
                  </Group>
                )}
                {oauth.oauthState != null && !oauth.isAuthorized && (
                  <Group gap="xs">
                    <Loader size="xs" />
                    <Text c="text-secondary">{t`Waiting for authorization…`}</Text>
                  </Group>
                )}
              </Group>
              {oauth.oauthError != null && (
                <Alert color="error">{oauth.oauthError}</Alert>
              )}
              <Divider label={t`or`} />
            </>
          )}
          <TextInput
            label={
              connector["oauth-configured"]
                ? t`Paste an API token`
                : t`API token`
            }
            placeholder={t`Your API token`}
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
          <Group justify="flex-end" mt="sm">
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <Button
              variant="filled"
              disabled={!canContinue}
              onClick={() => setStep("config")}
            >
              {t`Continue`}
            </Button>
          </Group>
        </Stack>
      ) : (
        <Stack gap="md" mt="sm">
          <TextInput
            label={t`Connection name`}
            placeholder={connector.name}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {configFields.map((field) => (
            <TextInput
              key={field.key}
              label={field.label}
              required={field.required}
              value={configValues[field.key] ?? ""}
              onChange={(event) =>
                setConfigValues((values) => ({
                  ...values,
                  [field.key]: event.target.value,
                }))
              }
            />
          ))}
          <Stack gap="sm">
            <Text fw="bold">{t`What to sync`}</Text>
            {connector.streams.map((stream) => (
              <Checkbox
                key={stream.key}
                label={stream.label}
                description={stream.description}
                checked={selectedStreamKeys.includes(stream.key)}
                onChange={(event) =>
                  toggleStream(stream.key, event.currentTarget.checked)
                }
              />
            ))}
            {selectedStreams.length === 0 && (
              <Text c="error" fz="sm">
                {t`Select at least one thing to sync.`}
              </Text>
            )}
          </Stack>
          <Select
            label={t`Target database`}
            placeholder={t`Pick a database`}
            required
            data={(transformsDatabases ?? []).map((database) => ({
              value: String(database.id),
              label: database.name,
            }))}
            value={databaseId}
            disabled={isLoadingDatabases}
            onChange={setDatabaseId}
          />
          <TextInput
            label={t`Schema`}
            placeholder={t`Default schema`}
            value={schema}
            onChange={(event) => setSchema(event.target.value)}
          />
          {singleSelectedStream != null && (
            <TextInput
              label={t`Table name`}
              placeholder={singleSelectedStream["default-table"]}
              value={tableName}
              onChange={(event) => setTableName(event.target.value)}
            />
          )}
          {submitError != null && <Alert color="error">{submitError}</Alert>}
          <Group justify="flex-end" mt="sm">
            <Button onClick={() => setStep("auth")}>{t`Back`}</Button>
            <Button
              variant="filled"
              disabled={!canSubmit}
              loading={isSubmitting}
              onClick={handleSubmit}
            >
              {t`Create connection`}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
