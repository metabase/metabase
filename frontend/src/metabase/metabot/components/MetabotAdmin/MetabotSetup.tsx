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

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { SetByEnvVar } from "metabase/admin/settings/components/widgets/AdminSettingInput";
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
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useSetting, useToast } from "metabase/common/hooks";
import { PLUGIN_METABOT } from "metabase/plugins";
import {
  Badge,
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

function getModelDescription(provider: MetabotProvider | undefined) {
  if (provider === "metabase") {
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase AI service
    return t`Available models are provided by Metabase.`;
  }

  return t`Available models are fetched from the selected provider using its configured API key.`;
}

const MetabotSetupContext = createContext<{
  connectHandlerRef: MutableRefObject<(() => Promise<void>) | null> | null;
  disconnectHandlerRef: MutableRefObject<(() => Promise<void>) | null> | null;
  isLoading: boolean;
  isConnectButtonEnabled: boolean;
  setIsConnectButtonEnabled: (enabled: boolean) => void;
  resetProvider: VoidFunction;
  handleDisconnect: VoidFunction;
  isModal: boolean;
}>({
  isLoading: false,
  connectHandlerRef: null,
  disconnectHandlerRef: null,
  isConnectButtonEnabled: false,
  setIsConnectButtonEnabled: () => {},
  resetProvider: () => {},
  handleDisconnect: () => {},
  isModal: false,
});

export function useMetabotSetupContext(
  onConnect: (() => Promise<void>) | null,
  onDisconnect: (() => Promise<void>) | null = null,
) {
  const {
    connectHandlerRef,
    disconnectHandlerRef,
    isLoading,
    setIsConnectButtonEnabled,
    resetProvider,
    handleDisconnect,
    isModal,
  } = useContext(MetabotSetupContext);

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

  return { isLoading, resetProvider, handleDisconnect, isModal };
}

export function MetabotSetup({ id }: { id?: string }) {
  const offerMetabaseAiManaged = PLUGIN_METABOT.isEnabled;
  const { value: savedProviderValue } = useAdminSetting("llm-metabot-provider");
  const config = useMemo(
    () => parseProviderAndModel(savedProviderValue),
    [savedProviderValue],
  );
  const isConfigured = !!useSetting("llm-metabot-configured?");
  const connectedProvider = isConfigured ? config?.provider : undefined;

  return (
    <SettingsSection
      id={id}
      title={
        <Flex justify="space-between" align="center">
          <Group gap="xs" wrap="nowrap">
            {isConfigured ? (
              <Badge circle size="12" bg="success" mr="sm" />
            ) : null}
            <div>
              {connectedProvider
                ? t`Connected to ${getProviderOptions(offerMetabaseAiManaged)[connectedProvider]?.label}`
                : t`Connect to an AI provider`}
            </div>
          </Group>
        </Flex>
      }
      description={
        !connectedProvider
          ? t`Select your AI provider to use AI explorations, SQL generation and Metabot.`
          : undefined
      }
    >
      <MetabotSetupInner />
    </SettingsSection>
  );
}

export function MetabotSetupInner({
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
  const disconnectHandlerRef = useRef<(() => Promise<void>) | null>(null);

  const { details: providerApiKeyDetails } = useAdminSettings([
    "llm-anthropic-api-key",
    "llm-openai-api-key",
    "llm-openrouter-api-key",
  ] as const);

  const handleDisconnect = useCallback(async () => {
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

  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
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

  const isLoading =
    isConnecting || isDisconnecting || updateSettingsResult.isLoading;
  const [isConnectButtonEnabled, setIsConnectButtonEnabled] = useState(false);

  return (
    <MetabotSetupContext.Provider
      value={{
        connectHandlerRef,
        disconnectHandlerRef,
        isLoading,
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
            disabled={isEnvSetting || isLoading}
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
          .with("metabase", () => <MetabaseAIProviderSetup />)
          .with(P.nonNullable, (selectedProvider) => (
            <AIProviderSetup
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
                loading={isLoading}
                disabled={isLoading}
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
                  loading={isLoading}
                  disabled={isLoading}
                  onClick={async () => {
                    setIsDisconnecting(true);
                    try {
                      await handleDisconnect();
                    } finally {
                      setIsDisconnecting(false);
                    }
                  }}
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
                  loading={isLoading}
                  disabled={isLoading || !isConnectButtonEnabled}
                  onClick={handleConnect}
                >
                  {t`Connect`}
                </Button>
              ),
            )
            .exhaustive()}
        </Flex>
      </Stack>
    </MetabotSetupContext.Provider>
  );
}

const AIProviderSetup = ({
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
  const [model, setModel] = useState<string | undefined>(connectedModel);
  const [apiKeyLocalValue, setApiKeyLocalValue] = useState<string | null>(null);
  const [sendToast] = useToast();

  useEffect(() => {
    setModel(connectedModel);
  }, [connectedModel]);

  const [updateMetabotSettings, updateMetabotSettingsResult] =
    useUpdateMetabotSettingsMutation();

  const onConnect = async () => {
    await updateMetabotSettings({
      provider: selectedProvider,
      "api-key": apiKeyLocalValue || null,
    }).unwrap();

    setApiKeyLocalValue(null);
  };

  const hasDirtyApiKey = apiKeyLocalValue !== null;
  const connectHandler =
    !isCurrentConfigured || hasDirtyApiKey ? onConnect : null;

  const { isLoading } = useMetabotSetupContext(connectHandler);

  const { details: providerApiKeyDetails } = useAdminSettings([
    "llm-anthropic-api-key",
    "llm-openai-api-key",
    "llm-openrouter-api-key",
  ] as const);

  const selectedApiKeySetting =
    providerApiKeyDetails[API_KEY_SETTING_BY_PROVIDER[selectedProvider]];
  const selectedApiKeyValue = String(selectedApiKeySetting?.value ?? "");
  const needsApiKey = !hasConfiguredSettingValue(selectedApiKeySetting);

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

  const displayApiKeyValue = apiKeyLocalValue ?? selectedApiKeyValue;

  useEffect(() => {
    setApiKeyLocalValue(null);
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
      <TextInput
        key={selectedProvider}
        label={t`API key`}
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
        onChange={handleApiKeyChange}
        disabled={isLoading || isEnvSetting}
        w="100%"
      />

      {isEnvSetting && selectedApiKeySetting?.env_name ? (
        <SetByEnvVar varName={selectedApiKeySetting.env_name} />
      ) : null}

      {!needsApiKey && (
        <Select
          label={t`Model`}
          placeholder={
            metabotSettingsQuery.isFetching
              ? t`Loading models...`
              : t`Select a model`
          }
          description={getModelDescription(selectedProvider)}
          error={modelError}
          data={modelOptions}
          value={model}
          onChange={handleModelChange}
          disabled={isEnvSetting || needsApiKey || isLoading}
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
