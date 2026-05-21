import { skipToken } from "@reduxjs/toolkit/query";
import cx from "classnames";
import { forwardRef, useEffect, useMemo } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import { parseProviderAndModel } from "metabase/admin/ai/utils";
import { useGetMetabotSettingsQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useSetting } from "metabase/common/hooks";
import type { MetabotPromptInputRef } from "metabase/metabot";
import { MetabotIcon } from "metabase/metabot/components/MetabotIcon";
import {
  MetabotPromptInput,
  type MetabotPromptInputProps,
} from "metabase/metabot/components/MetabotPromptInput";
import {
  Box,
  Flex,
  Icon,
  Loader,
  Select,
  type SelectOption,
  Stack,
  UnstyledButton,
} from "metabase/ui";

import S from "./MetabotChatEditor.module.css";

type MetabotChatEditorProps = Pick<
  MetabotPromptInputProps,
  | "value"
  | "placeholder"
  | "autoFocus"
  | "onChange"
  | "onSubmit"
  | "onStop"
  | "suggestionConfig"
> & {
  isResponding?: boolean;
  modelOverride?: string;
  onModelOverrideChange: (model: string | undefined) => void;
};

export const MetabotChatEditor = forwardRef<
  MetabotPromptInputRef | null,
  MetabotChatEditorProps
>(
  (
    { isResponding = false, modelOverride, onModelOverrideChange, ...props },
    ref,
  ) => {
    const savedProviderValue = useSetting("llm-metabot-provider");
    const isModelSelectionEnabled =
      useSetting("llm-metabot-conversation-model-selection-enabled") !== false;
    const configuredModel = parseProviderAndModel(savedProviderValue);
    const showModelSelector =
      isModelSelectionEnabled && configuredModel?.provider !== "metabase";
    const { data, isLoading, error } = useGetMetabotSettingsQuery(
      showModelSelector ? {} : skipToken,
    );
    const defaultModel = savedProviderValue ?? undefined;
    const modelOptions = useMemo<SelectOption[]>(
      () =>
        (data?.models ?? []).map((model) => ({
          value: model.value,
          label: model.display_name,
          icon: model.original_provider,
        })),
      [data?.models],
    );
    const selectedModel = modelOverride ?? defaultModel;
    const selectedModelOption = modelOptions.find(
      (option) => option.value === selectedModel,
    );
    const isModelSelectDisabled = isResponding || isLoading;

    useEffect(
      function switchToDefaultIfOverrideIsUnavailbable() {
        if (!selectedModelOption && !isLoading) {
          onModelOverrideChange(undefined);
        }
      },
      [isLoading, onModelOverrideChange, selectedModelOption],
    );

    return (
      <Stack w="100%" gap={0}>
        <Box className={S.contentWrapper}>
          <MetabotPromptInput
            {...props}
            ref={ref}
            disabled={isResponding}
            data-testid="metabot-chat-input"
          />
        </Box>
        <Flex align="center" gap="sm" h="2.5rem">
          <Box className={S.iconContainer} mr="auto">
            <MetabotIcon c="brand" />
          </Box>
          {showModelSelector && (
            <Select
              data-testid="metabot-model-selector"
              data={modelOptions}
              value={selectedModelOption?.value}
              onChange={(model) =>
                onModelOverrideChange(
                  model === defaultModel ? undefined : (model ?? undefined),
                )
              }
              disabled={isModelSelectDisabled}
              placeholder={match({ error, isLoading })
                .with({ error: P.nonNullable }, (error) =>
                  getErrorMessage(error, t`Error loading models`),
                )
                .with({ isLoading: true }, () => t`Loading...`)
                .otherwise(() => undefined)}
              leftSection={
                isLoading ? (
                  <Loader size="0.75rem" color="text-tertiary" />
                ) : selectedModelOption?.icon ? (
                  <Icon aria-hidden name={selectedModelOption.icon} />
                ) : undefined
              }
              rightSection={<Icon size="0.5rem" name="chevrondown" />}
              leftSectionWidth="1.25rem"
              rightSectionWidth="1rem"
              comboboxProps={{ position: "top" }}
              classNames={{
                root: S.modelSelectRoot,
                wrapper: S.modelSelectWrapper,
                input: S.modelSelectInput,
                section: S.modelSelectSection,
                dropdown: S.modelSelectDropdown,
                option: S.modelSelectOption,
              }}
            />
          )}
          <UnstyledButton
            className={cx(S.button, isResponding && S.buttonResponding)}
            disabled={props.value.length === 0 || isResponding}
            onClick={isResponding ? props.onStop : props.onSubmit}
            data-testid={
              isResponding ? "metabot-stop-response" : "metabot-send-message"
            }
          >
            {isResponding ? (
              <Icon className={S.stopIcon} name="stop" />
            ) : (
              <Icon className={S.sendIcon} name="arrow_up" />
            )}
          </UnstyledButton>
        </Flex>
      </Stack>
    );
  },
);

// @ts-expect-error - must set a displayName
MetabotChatEditor.displayName = "MetabotChatEditor";
