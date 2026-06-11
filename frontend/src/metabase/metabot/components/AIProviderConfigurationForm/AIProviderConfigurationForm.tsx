import {
  type ChangeEvent,
  Fragment,
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
  Button,
  type ComboboxItem,
  Flex,
  Group,
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

type BedrockExtraField = "secretAccessKey" | "region" | "sessionToken";

const BEDROCK_EXTRA_FIELDS = [
  {
    key: "secretAccessKey",
    settingKey: "llm-bedrock-secret-access-key",
    password: true,
  },
  { key: "region", settingKey: "llm-bedrock-region", password: false },
  {
    key: "sessionToken",
    settingKey: "llm-bedrock-session-token",
    password: true,
  },
] as const;

const UNTOUCHED_BEDROCK_VALUES: Record<BedrockExtraField, string | null> = {
  secretAccessKey: null,
  region: null,
  sessionToken: null,
};

function getBedrockFieldCopy(field: BedrockExtraField): {
  label: string;
  description?: string;
  placeholder?: string;
} {
  switch (field) {
    case "secretAccessKey":
      return {
        label: t`Secret access key`,
        placeholder: t`Enter your AWS secret access key`,
      };
    case "region":
      return {
        label: t`Region`,
        description: t`The AWS region to use for Bedrock.`,
        placeholder: "us-east-1",
      };
    case "sessionToken":
      return {
        label: t`Session token`,
        description: t`Optional. Only needed for temporary AWS credentials.`,
        placeholder: t`Enter your AWS session token`,
      };
  }
}

function getModelDescription(provider: MetabotProvider | undefined) {
  if (provider === "metabase") {
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- "Metabase" is the product name for the managed AI provider option, only shown to admins configuring AI.
    return t`Available models are provided by Metabase.`;
  }

  return t`Available models are fetched from the selected provider using its configured credentials.`;
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

  const isCurrentConfigured = connectedProvider === provider && isConfigured;

  useEffect(() => {
    if (isModal) {
      return;
    }
    setProvider(connectedProvider);
  }, [isModal, connectedProvider]);

  const [updateSettings, updateSettingsResult] = useUpdateSettingsMutation();
  const [updateMetabotSettings] = useUpdateMetabotSettingsMutation();
  const disconnectHandlerRef = useRef<(() => Promise<void>) | null>(null);

  const { details: providerApiKeyDetails } = useAdminSettings([
    "llm-anthropic-api-key",
    "llm-openai-api-key",
    "llm-openrouter-api-key",
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

    if (connectedProvider !== "metabase" && connectedProvider !== "bedrock") {
      const apiKeySettingKey = API_KEY_SETTING_BY_PROVIDER[connectedProvider];
      const apiKeySetting = providerApiKeyDetails[apiKeySettingKey];

      if (!apiKeySetting?.is_env_setting) {
        settingsToClear[apiKeySettingKey] = null;
      }
    }

    try {
      if (connectedProvider === "bedrock") {
        // Bedrock key material spans several settings; an explicit `credentials: null`
        // clears them all in one call. It runs before the provider is deselected so a
        // failure can't leave saved keys behind.
        await updateMetabotSettings({
          provider: "bedrock",
          credentials: null,
        }).unwrap();
      }

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
    updateMetabotSettings,
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

const ProviderCredentialsFields = ({
  selectedProvider,
  connectedModel,
  isCurrentConfigured,
  isEnvSetting,
}: {
  selectedProvider: Exclude<MetabotProvider, "metabase">;
  connectedModel: string | undefined;
  isCurrentConfigured: boolean;
  isEnvSetting: boolean;
}) => {
  const isBedrock = selectedProvider === "bedrock";
  const [model, setModel] = useState<string | undefined>(connectedModel);
  const [apiKeyLocalValue, setApiKeyLocalValue] = useState<string | null>(null);
  const [bedrockLocalValues, setBedrockLocalValues] = useState<
    Record<BedrockExtraField, string | null>
  >(UNTOUCHED_BEDROCK_VALUES);
  const [sendToast] = useToast();

  useEffect(() => {
    setModel(connectedModel);
  }, [connectedModel]);

  const [updateMetabotSettings, updateMetabotSettingsResult] =
    useUpdateMetabotSettingsMutation();

  const { details: providerApiKeyDetails } = useAdminSettings([
    "llm-anthropic-api-key",
    "llm-openai-api-key",
    "llm-openrouter-api-key",
    "llm-bedrock-access-key-id",
    "llm-bedrock-secret-access-key",
    "llm-bedrock-region",
    "llm-bedrock-session-token",
  ] as const);

  const selectedApiKeySetting =
    providerApiKeyDetails[API_KEY_SETTING_BY_PROVIDER[selectedProvider]];
  const selectedApiKeyValue = String(selectedApiKeySetting?.value ?? "");
  const apiKeyEnvSettingName = selectedApiKeySetting?.is_env_setting
    ? selectedApiKeySetting.env_name
    : undefined;

  // Display values fall back to the saved settings so untouched fields round-trip unchanged
  // when connecting.
  const displayBedrockValues = Object.fromEntries(
    BEDROCK_EXTRA_FIELDS.map(({ key, settingKey }) => [
      key,
      bedrockLocalValues[key] ??
        String(providerApiKeyDetails[settingKey]?.value ?? ""),
    ]),
  ) as Record<BedrockExtraField, string>;

  const onConnect = async () => {
    if (isBedrock) {
      await updateMetabotSettings({
        provider: selectedProvider,
        credentials: {
          "access-key-id": apiKeyLocalValue || null,
          "secret-access-key": bedrockLocalValues.secretAccessKey || null,
          region: bedrockLocalValues.region || null,
          "session-token": bedrockLocalValues.sessionToken || null,
        },
      }).unwrap();
    } else {
      await updateMetabotSettings({
        provider: selectedProvider,
        "api-key": apiKeyLocalValue || null,
      }).unwrap();
    }

    setApiKeyLocalValue(null);
    setBedrockLocalValues(UNTOUCHED_BEDROCK_VALUES);
  };

  const hasDirtyApiKey = apiKeyLocalValue !== null;
  const hasDirtyBedrockCredentials =
    isBedrock && Object.values(bedrockLocalValues).some((v) => v !== null);
  const connectHandler =
    !isCurrentConfigured || hasDirtyApiKey || hasDirtyBedrockCredentials
      ? onConnect
      : null;

  const { isMutating } = useAIProviderConfigurationContext(connectHandler);

  const needsApiKey = isBedrock
    ? !hasConfiguredSettingValue(selectedApiKeySetting) ||
      !hasConfiguredSettingValue(
        providerApiKeyDetails["llm-bedrock-secret-access-key"],
      )
    : !hasConfiguredSettingValue(selectedApiKeySetting);

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
  const credentialsError = hasDirtyApiKey
    ? undefined
    : (metabotSettingsQuery.currentData?.["credentials-error"] ?? undefined);

  const displayApiKeyValue = apiKeyLocalValue ?? selectedApiKeyValue;

  useEffect(() => {
    setApiKeyLocalValue(null);
    setBedrockLocalValues(UNTOUCHED_BEDROCK_VALUES);
  }, [selectedProvider, selectedApiKeySetting?.value]);

  const handleApiKeyChange = (event: ChangeEvent<HTMLInputElement>) => {
    setApiKeyLocalValue(event.target.value);
  };

  const handleBedrockFieldChange =
    (field: BedrockExtraField) => (event: ChangeEvent<HTMLInputElement>) => {
      setBedrockLocalValues((values) => ({
        ...values,
        [field]: event.target.value,
      }));
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
      <TextInput
        key={selectedProvider}
        label={isBedrock ? t`Access key ID` : t`API key`}
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
          selectedProviderDetails.apiKey?.placeholder ?? t`Enter your API key`
        }
        value={displayApiKeyValue}
        error={credentialsError}
        onChange={handleApiKeyChange}
        disabled={isMutating || isEnvSetting || !!apiKeyEnvSettingName}
        w="100%"
      />

      {apiKeyEnvSettingName ? (
        <SetByEnvVar varName={apiKeyEnvSettingName} />
      ) : null}

      {isBedrock &&
        BEDROCK_EXTRA_FIELDS.map(({ key, settingKey, password }) => {
          const { label, description, placeholder } = getBedrockFieldCopy(key);
          const setting = providerApiKeyDetails[settingKey];
          const envSettingName = setting?.is_env_setting
            ? setting.env_name
            : undefined;

          return (
            <Fragment key={key}>
              <TextInput
                label={label}
                type={password ? "password" : undefined}
                description={description}
                placeholder={placeholder}
                value={displayBedrockValues[key]}
                onChange={handleBedrockFieldChange(key)}
                disabled={isMutating || isEnvSetting || !!envSettingName}
                w="100%"
              />
              {envSettingName && <SetByEnvVar varName={envSettingName} />}
            </Fragment>
          );
        })}

      {!needsApiKey && !credentialsError && (
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
