import {
  type ChangeEvent,
  type MutableRefObject,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { P, match } from "ts-pattern";
import { c, t } from "ttag";
import _ from "underscore";

import {
  skipToken,
  useGetMetabotSettingsQuery,
  useUpdateMetabotSettingsMutation,
  useUpdateSettingsMutation,
} from "metabase/api";
import {
  getErrorMessage,
  useAdminSetting,
  useAdminSettings,
} from "metabase/api/utils";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { SetByEnvVar } from "metabase/common/components/SetByEnvVar";
import { useSetting, useToast } from "metabase/common/hooks";
import { PLUGIN_METABOT } from "metabase/plugins";
import {
  Alert,
  Button,
  type ComboboxItem,
  Flex,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import type {
  MetabotProvider,
  MetabotSettingsResponse,
  SettingDefinition,
} from "metabase-types/api";

import {
  API_KEY_SETTING_BY_PROVIDER,
  getProviderOptions,
  isAvailableProvider,
  parseProviderAndModel,
} from "./utils";

type MetabotModelOption = ComboboxItem & {
  group?: string | null;
};

function getModelDescription(provider: MetabotProvider | undefined) {
  if (provider === "metabase") {
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- "Metabase" is the product name for the managed AI provider option, only shown to admins configuring AI.
    return t`Available models are provided by Metabase.`;
  }

  return t`Available models are fetched from the selected provider using its configured API key.`;
}

const AIProviderConfigurationContext = createContext<{
  connectHandlerRef: MutableRefObject<(() => Promise<void>) | null> | null;
  disconnectHandlerRef: MutableRefObject<(() => Promise<void>) | null> | null;
  isMutating: boolean;
  isConnectButtonEnabled: boolean;
  setIsConnectButtonEnabled: (enabled: boolean) => void;
  resetProvider: VoidFunction;
  handleDisconnect: VoidFunction;
  isModal: boolean;
}>({
  isMutating: false,
  connectHandlerRef: null,
  disconnectHandlerRef: null,
  isConnectButtonEnabled: false,
  setIsConnectButtonEnabled: () => {},
  resetProvider: () => {},
  handleDisconnect: () => {},
  isModal: false,
});

export function useAIProviderConfigurationContext(
  onConnect: (() => Promise<void>) | null,
  onDisconnect: (() => Promise<void>) | null = null,
) {
  const {
    connectHandlerRef,
    disconnectHandlerRef,
    isMutating,
    setIsConnectButtonEnabled,
    resetProvider,
    handleDisconnect,
    isModal,
  } = useContext(AIProviderConfigurationContext);

  useEffect(() => {
    if (!connectHandlerRef) {
      return;
    }

    connectHandlerRef.current = onConnect;
    setIsConnectButtonEnabled(!!onConnect);

    return () => {
      setIsConnectButtonEnabled(false);
      connectHandlerRef.current = null;
    };
  }, [connectHandlerRef, onConnect, setIsConnectButtonEnabled]);

  useEffect(() => {
    if (!disconnectHandlerRef) {
      return;
    }

    disconnectHandlerRef.current = onDisconnect;

    return () => {
      disconnectHandlerRef.current = null;
    };
  }, [disconnectHandlerRef, onDisconnect]);

  return { isMutating, resetProvider, handleDisconnect, isModal };
}

export function AIProviderConfigurationForm({
  isModal = false,
  onClose,
}: {
  isModal?: boolean;
  onClose?: VoidFunction;
}) {
  const MetabaseAIProviderSetup = PLUGIN_METABOT.MetabaseAIProviderSetup;
  const offerMetabaseAiManaged = PLUGIN_METABOT.isEnabled;
  const [sendToast] = useToast();

  const { value: savedProviderValue, settingDetails } = useAdminSetting(
    "llm-metabot-provider",
  );
  const isEnvSetting =
    !!settingDetails &&
    !!settingDetails.is_env_setting &&
    !!settingDetails.env_name;
  const envSettingName = isEnvSetting ? settingDetails?.env_name : undefined;

  const isConfigured = !!useSetting("llm-metabot-configured?");

  const config = useMemo(
    () => parseProviderAndModel(savedProviderValue),
    [savedProviderValue],
  );
  const connectedProvider = isConfigured ? config?.provider : undefined;
  const connectedModel = isConfigured ? config?.model : undefined;
  const [provider, setProvider] = useState<MetabotProvider | undefined>(
    isModal ? undefined : connectedProvider,
  );

  const connectedProviderSettingsQuery = useGetMetabotSettingsQuery(
    connectedProvider && connectedProvider !== "metabase"
      ? { provider: connectedProvider }
      : skipToken,
  );

  const isCurrentConfigured = connectedProvider === provider && isConfigured;

  useEffect(() => {
    if (isModal) {
      return;
    }
    setProvider(connectedProvider);
  }, [isModal, connectedProvider]);

  const [updateSettings, updateSettingsResult] = useUpdateSettingsMutation();
  const disconnectHandlerRef = useRef<(() => Promise<void>) | null>(null);

  const { details: providerApiKeyDetails } = useAdminSettings([
    "llm-anthropic-api-key",
    "llm-openai-api-key",
    "llm-openrouter-api-key",
    "llm-bedrock-api-key",
    "llm-bedrock-access-key-id",
  ] as const);

  const disconnectProvider = useCallback(async () => {
    if (!connectedProvider) {
      return;
    }

    try {
      await disconnectHandlerRef.current?.();
    } catch {
      return;
    }

    const settingsToClear: Record<string, null> = {
      "llm-metabot-provider": null,
    };

    if (connectedProvider !== "metabase") {
      const apiKeySettingKey = API_KEY_SETTING_BY_PROVIDER[connectedProvider];
      const apiKeySetting = providerApiKeyDetails[apiKeySettingKey];

      if (!apiKeySetting?.is_env_setting) {
        settingsToClear[apiKeySettingKey] = null;
      }
    }

    if (connectedProvider === "bedrock") {
      settingsToClear["llm-bedrock-api-key"] = null;
      settingsToClear["llm-bedrock-secret-access-key"] = null;
      settingsToClear["llm-bedrock-session-token"] = null;
      settingsToClear["llm-bedrock-auth-type"] = null;
      settingsToClear["llm-bedrock-role-arn"] = null;
      settingsToClear["llm-bedrock-region"] = null;
    }

    try {
      const response = await updateSettings(settingsToClear);

      if (response.error) {
        const message = getErrorMessage(
          response.error,
          t`Unable to save provider settings.`,
        );

        sendToast({
          message,
          icon: "warning",
          toastColor: "error",
        });
      }
    } catch (error) {
      const message = getErrorMessage(
        error,
        t`Unable to save provider settings.`,
      );

      sendToast({
        message,
        icon: "warning",
        toastColor: "error",
      });
    }
  }, [
    connectedProvider,
    disconnectHandlerRef,
    providerApiKeyDetails,
    updateSettings,
    sendToast,
  ]);

  const providerOptions = useMemo(() => {
    const options = Object.values(getProviderOptions(offerMetabaseAiManaged));
    return options.map((option) => ({
      ...option,
      disabled: !isAvailableProvider(option.value),
    }));
  }, [offerMetabaseAiManaged]);

  const connectHandlerRef = useRef<(() => Promise<void>) | null>(null);

  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isDisconnectConfirmOpen, setIsDisconnectConfirmOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const handleConnect = async () => {
    if (!connectHandlerRef.current) {
      return;
    }
    setIsConnecting(true);
    try {
      await connectHandlerRef.current();
    } finally {
      setIsConnecting(false);
    }
  };

  const resetProvider = () => {
    setProvider(undefined);
  };

  const handleDisconnect = useCallback(() => {
    setIsDisconnectConfirmOpen(true);
  }, []);

  const handleConfirmDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await disconnectProvider();
      setIsDisconnectConfirmOpen(false);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const isMutating =
    isConnecting || isDisconnecting || updateSettingsResult.isLoading;

  const [isConnectButtonEnabled, setIsConnectButtonEnabled] = useState(false);

  return (
    <AIProviderConfigurationContext.Provider
      value={{
        connectHandlerRef,
        disconnectHandlerRef,
        isMutating,
        setIsConnectButtonEnabled,
        isConnectButtonEnabled,
        resetProvider,
        handleDisconnect,
        isModal: !!isModal,
      }}
    >
      <Stack gap="md">
        {!isCurrentConfigured && (
          <Select
            label={t`Provider`}
            placeholder={t`Select a provider`}
            data={providerOptions}
            value={provider}
            onChange={setProvider}
            disabled={isEnvSetting || isMutating}
            renderOption={({ option }) => (
              <Group
                gap="xs"
                p="sm"
                justify="space-between"
                wrap="nowrap"
                w="100%"
              >
                <Text
                  lh="1rem"
                  c={option.disabled ? "text-tertiary" : undefined}
                >
                  {option.label}
                </Text>
                {!isAvailableProvider(option.value as MetabotProvider) && (
                  <Text c="text-tertiary" lh="1rem" size="sm">
                    {t`Coming soon`}
                  </Text>
                )}
              </Group>
            )}
          />
        )}

        {match(provider)
          .with("metabase", () => (
            <MetabaseAIProviderSetup onConnect={onClose} />
          ))
          .with(P.nonNullable, (selectedProvider) => (
            <ProviderCredentialsFields
              selectedProvider={selectedProvider}
              connectedModel={connectedModel}
              isCurrentConfigured={isCurrentConfigured}
              isEnvSetting={isEnvSetting}
              savedBedrockRegion={
                connectedProviderSettingsQuery.currentData?.[
                  "bedrock-region"
                ] ?? undefined
              }
              savedBedrockAuthType={
                connectedProviderSettingsQuery.currentData?.[
                  "bedrock-auth-type"
                ] ?? undefined
              }
            />
          ))
          .with(P.nullish, () => null)
          .exhaustive()}

        {envSettingName && <SetByEnvVar varName={envSettingName} />}

        <Flex justify="end">
          {match({ isCurrentConfigured, isConnectButtonEnabled, isModal })
            .with({ isModal: true, isCurrentConfigured: true }, () => (
              <Button
                variant="filled"
                loading={isMutating}
                disabled={isMutating}
                onClick={onClose}
              >
                {t`Done`}
              </Button>
            ))
            .with(
              { isCurrentConfigured: true, isConnectButtonEnabled: false },
              () => (
                <Button
                  c="danger"
                  loading={isMutating}
                  disabled={isMutating}
                  onClick={handleDisconnect}
                >
                  {t`Disconnect`}
                </Button>
              ),
            )
            .with(
              { isCurrentConfigured: false },
              { isCurrentConfigured: true, isConnectButtonEnabled: true },
              () => (
                <Button
                  variant="filled"
                  loading={isMutating}
                  disabled={isMutating || !isConnectButtonEnabled}
                  onClick={handleConnect}
                >
                  {t`Connect`}
                </Button>
              ),
            )
            .exhaustive()}
        </Flex>
        <ConfirmModal
          opened={isDisconnectConfirmOpen}
          onClose={() => setIsDisconnectConfirmOpen(false)}
          title={t`Disconnect AI provider?`}
          message={t`This will disconnect your AI provider and disable AI features across your instance until you connect a provider again.`}
          confirmButtonText={t`Disconnect provider`}
          onConfirm={handleConfirmDisconnect}
        />
      </Stack>
    </AIProviderConfigurationContext.Provider>
  );
}

type BedrockAuthType =
  | "api-key"
  | "iam-credentials"
  | "session-token"
  | "iam-role";

const BEDROCK_REGIONS = [
  // US
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-east-2", label: "US East (Ohio)" },
  { value: "us-west-1", label: "US West (N. California)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  // Canada
  { value: "ca-central-1", label: "Canada (Central)" },
  // South America
  { value: "sa-east-1", label: "South America (São Paulo)" },
  // Europe
  { value: "eu-west-1", label: "EU (Ireland)" },
  { value: "eu-west-2", label: "EU (London)" },
  { value: "eu-west-3", label: "EU (Paris)" },
  { value: "eu-central-1", label: "EU (Frankfurt)" },
  { value: "eu-central-2", label: "EU (Zurich)" },
  { value: "eu-north-1", label: "EU (Stockholm)" },
  // Asia Pacific
  { value: "ap-south-1", label: "Asia Pacific (Mumbai)" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
  { value: "ap-southeast-2", label: "Asia Pacific (Sydney)" },
  { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
  { value: "ap-northeast-2", label: "Asia Pacific (Seoul)" },
  // Middle East
  { value: "me-south-1", label: "Middle East (Bahrain)" },
  { value: "me-central-1", label: "Middle East (UAE)" },
  // Africa
  { value: "af-south-1", label: "Africa (Cape Town)" },
  // GovCloud
  { value: "us-gov-west-1", label: "AWS GovCloud (US-West)" },
];

const ProviderCredentialsFields = ({
  selectedProvider,
  connectedModel,
  isCurrentConfigured,
  isEnvSetting,
  savedBedrockRegion,
  savedBedrockAuthType,
}: {
  selectedProvider: Exclude<MetabotProvider, "metabase">;
  connectedModel: string | undefined;
  isCurrentConfigured: boolean;
  isEnvSetting: boolean;
  savedBedrockRegion?: string;
  savedBedrockAuthType?: string;
}) => {
  const [model, setModel] = useState<string | undefined>(connectedModel);
  const [apiKeyLocalValue, setApiKeyLocalValue] = useState<string | null>(null);
  const [sendToast] = useToast();

  // Bedrock-specific local state
  const isBedrock = selectedProvider === "bedrock";
  const [bedrockSecretKey, setBedrockSecretKey] = useState<string | null>(null);
  const [bedrockAuthType, setBedrockAuthType] = useState<BedrockAuthType>(
    (savedBedrockAuthType as BedrockAuthType) || "api-key",
  );
  const [bedrockRegion, setBedrockRegion] = useState<string>(
    savedBedrockRegion || "us-east-1",
  );
  const [bedrockSessionToken, setBedrockSessionToken] = useState<string | null>(
    null,
  );
  const [bedrockRoleArn, setBedrockRoleArn] = useState<string | null>(null);

  useEffect(() => {
    setModel(connectedModel);
  }, [connectedModel]);

  const [updateMetabotSettings, updateMetabotSettingsResult] =
    useUpdateMetabotSettingsMutation();

  const onConnect = async () => {
    if (isBedrock) {
      await updateMetabotSettings({
        provider: selectedProvider,
        "api-key": apiKeyLocalValue || null,
        "secret-key": bedrockSecretKey || null,
        region: bedrockRegion,
        "auth-type": bedrockAuthType,
        "session-token":
          bedrockAuthType === "session-token" ? bedrockSessionToken : null,
        "role-arn": bedrockAuthType === "iam-role" ? bedrockRoleArn : null,
      }).unwrap();
    } else {
      await updateMetabotSettings({
        provider: selectedProvider,
        "api-key": apiKeyLocalValue || null,
      }).unwrap();
    }

    setApiKeyLocalValue(null);
    setBedrockSecretKey(null);
  };

  const hasDirtyApiKey = apiKeyLocalValue !== null;
  const hasDirtyBedrockFields = isBedrock && bedrockSecretKey !== null;
  const connectHandler =
    !isCurrentConfigured || hasDirtyApiKey || hasDirtyBedrockFields
      ? onConnect
      : null;

  const { isMutating } = useAIProviderConfigurationContext(connectHandler);

  const { details: providerApiKeyDetails } = useAdminSettings([
    "llm-anthropic-api-key",
    "llm-openai-api-key",
    "llm-openrouter-api-key",
    "llm-bedrock-api-key",
    "llm-bedrock-access-key-id",
  ] as const);

  const selectedApiKeySetting =
    providerApiKeyDetails[API_KEY_SETTING_BY_PROVIDER[selectedProvider]];
  const bedrockAccessKeySetting =
    providerApiKeyDetails["llm-bedrock-access-key-id"];
  const selectedApiKeyValue = String(selectedApiKeySetting?.value ?? "");
  const apiKeyEnvSettingName = selectedApiKeySetting?.is_env_setting
    ? selectedApiKeySetting.env_name
    : undefined;
  // For bedrock with IAM/session-token auth, check the access key setting instead of the API key
  const effectiveKeySetting =
    selectedProvider === "bedrock" &&
    (bedrockAuthType === "iam-credentials" ||
      bedrockAuthType === "session-token")
      ? bedrockAccessKeySetting
      : selectedApiKeySetting;
  const needsApiKey =
    bedrockAuthType !== "iam-role" &&
    !hasConfiguredSettingValue(effectiveKeySetting);

  const metabotSettingsQuery = useGetMetabotSettingsQuery(
    {
      provider: selectedProvider,
    },
    { skip: needsApiKey },
  );

  const modelOptions = useMemo(
    () => getLlmModelOptions(metabotSettingsQuery.currentData?.models ?? []),
    [metabotSettingsQuery.currentData?.models],
  );

  const modelError = getModelError(
    metabotSettingsQuery.error,
    selectedProvider,
  );
  const apiKeyError = hasDirtyApiKey
    ? undefined
    : (metabotSettingsQuery.currentData?.["api-key-error"] ?? undefined);

  const displayApiKeyValue = apiKeyLocalValue ?? selectedApiKeyValue;

  useEffect(() => {
    setApiKeyLocalValue(null);
    setBedrockSecretKey(null);
  }, [selectedProvider, selectedApiKeySetting?.value]);

  const handleApiKeyChange = (event: ChangeEvent<HTMLInputElement>) => {
    setApiKeyLocalValue(event.target.value);
  };

  const handleModelChange = async (value: string) => {
    setModel(value);

    if (!value) {
      return;
    }

    await updateMetabotSettings({
      provider: selectedProvider,
      model: value,
    }).unwrap();

    sendToast({
      message: t`Settings saved successfully`,
      icon: "check",
    });
  };

  const selectedProviderDetails = getProviderOptions(true)[selectedProvider];

  return (
    <>
      {isBedrock && (
        <>
          <Text fw={500} size="sm">{t`Authentication type`}</Text>
          <SegmentedControl
            value={bedrockAuthType}
            onChange={(value) => setBedrockAuthType(value as BedrockAuthType)}
            disabled={isMutating || isEnvSetting}
            data={[
              { value: "api-key", label: t`API Key` },
              { value: "iam-credentials", label: t`IAM Credentials` },
              { value: "session-token", label: t`Session Token` },
              { value: "iam-role", label: t`IAM Role (auto)` },
            ]}
          />
        </>
      )}

      {isBedrock && bedrockAuthType === "iam-role" ? (
        <>
          <Alert color="info" title={t`Automatic credential resolution`}>
            {t`Credentials will be fetched automatically from the EC2/ECS instance metadata service (IMDS). Optionally provide a Role ARN for STS AssumeRole.`}
          </Alert>
          <TextInput
            label={t`Role ARN (optional)`}
            placeholder="arn:aws:iam::123456789012:role/BedrockAccess"
            value={bedrockRoleArn ?? ""}
            onChange={(e) => setBedrockRoleArn(e.target.value)}
            disabled={isMutating || isEnvSetting}
            w="100%"
          />
        </>
      ) : isBedrock && bedrockAuthType === "api-key" ? (
        <>
          <TextInput
            key={`${selectedProvider}-api-key`}
            label={t`Bedrock API Key`}
            type="password"
            description={
              <ExternalLink
                key={selectedProviderDetails.value}
                href="https://console.aws.amazon.com/bedrock/home#/api-keys"
              >
                {t`Generate a Bedrock API key in the AWS Console`}
              </ExternalLink>
            }
            placeholder={t`Enter your Bedrock API key`}
            value={displayApiKeyValue}
            error={apiKeyError}
            onChange={handleApiKeyChange}
            disabled={isMutating || isEnvSetting || !!apiKeyEnvSettingName}
            w="100%"
          />

          {apiKeyEnvSettingName ? (
            <SetByEnvVar varName={apiKeyEnvSettingName} />
          ) : null}
        </>
      ) : (
        <>
          <TextInput
            key={selectedProvider}
            label={isBedrock ? t`Access Key ID` : t`API key`}
            type="password"
            description={
              <ExternalLink
                key={selectedProviderDetails.value}
                href={selectedProviderDetails.apiKey.addKeyUrl}
              >
                {c("{0} is the name of an AI provider")
                  .t`Get or manage keys in ${selectedProviderDetails.label}`}
              </ExternalLink>
            }
            placeholder={
              selectedProviderDetails.apiKey?.placeholder ??
              t`Enter your API key`
            }
            value={displayApiKeyValue}
            error={apiKeyError}
            onChange={handleApiKeyChange}
            disabled={isMutating || isEnvSetting || !!apiKeyEnvSettingName}
            w="100%"
          />

          {apiKeyEnvSettingName ? (
            <SetByEnvVar varName={apiKeyEnvSettingName} />
          ) : null}

          {isBedrock && (
            <TextInput
              label={t`Secret Access Key`}
              type="password"
              placeholder={t`Enter your AWS secret access key`}
              value={bedrockSecretKey ?? ""}
              onChange={(e) => setBedrockSecretKey(e.target.value)}
              disabled={isMutating || isEnvSetting}
              w="100%"
            />
          )}

          {isBedrock && bedrockAuthType === "session-token" && (
            <TextInput
              label={t`Session Token`}
              type="password"
              placeholder={t`Enter your AWS session token`}
              value={bedrockSessionToken ?? ""}
              onChange={(e) => setBedrockSessionToken(e.target.value)}
              disabled={isMutating || isEnvSetting}
              w="100%"
            />
          )}
        </>
      )}

      {isBedrock && (
        <Select
          label={t`Region`}
          data={BEDROCK_REGIONS}
          value={bedrockRegion}
          onChange={(value) => setBedrockRegion(value ?? "us-east-1")}
          disabled={isMutating || isEnvSetting}
          searchable
        />
      )}

      {!needsApiKey && !apiKeyError && (
        <Select
          label={t`Model`}
          placeholder={
            metabotSettingsQuery.isLoading
              ? t`Loading models...`
              : t`Select a model`
          }
          description={getModelDescription(selectedProvider)}
          error={modelError}
          data={modelOptions}
          value={model}
          onChange={handleModelChange}
          disabled={isEnvSetting || needsApiKey || isMutating}
          searchable
          nothingFoundMessage={t`No models found`}
        />
      )}

      {updateMetabotSettingsResult.error && (
        <Text size="sm" c="error">
          {getErrorMessage(
            updateMetabotSettingsResult.error,
            t`Unable to save provider settings.`,
          )}
        </Text>
      )}
    </>
  );
};

const getLlmModelOptions = (models: MetabotSettingsResponse["models"]) => {
  const modelOptions = models.map((m) => ({
    value: m.id,
    label: m.display_name,
    group: m.group,
  }));

  const sel = (o: MetabotModelOption) => _.pick(o, ["value", "label"]);
  // group model options if needed
  return _.every(modelOptions, (o) => !o.group)
    ? modelOptions.map(sel)
    : _.map(
        _.groupBy(modelOptions, (o) => o.group ?? t`Other`),
        (items, group) => ({ group, items: items.map(sel) }),
      );
};

const hasConfiguredSettingValue = (setting: SettingDefinition | undefined) =>
  Boolean(setting?.value || setting?.is_env_setting);

const getModelError = (error: unknown, provider?: MetabotProvider) =>
  !provider || !error
    ? undefined
    : getErrorMessage(error, t`Unable to load models.`);
