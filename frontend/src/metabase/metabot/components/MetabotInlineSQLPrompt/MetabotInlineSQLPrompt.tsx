import { useDisclosure } from "@mantine/hooks";
import { useCallback, useEffect, useRef } from "react";
import { tinykeys } from "tinykeys";
import { t } from "ttag";

import type { MetabotPromptInputRef } from "metabase/metabot";
import { AIProviderConfigurationModal } from "metabase/metabot/components/AIProviderConfigurationModal";
import { MetabotManagedProviderLimitHoverCard } from "metabase/metabot/components/MetabotManagedProviderLimit";
import { MetabotPromptInput } from "metabase/metabot/components/MetabotPromptInput";
import {
  useMetabotName,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import type { MetabotAgentTurnDisplayError } from "metabase/metabot/state";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import { Box, Button, Flex, Icon, Loader, Tooltip } from "metabase/ui";
import type { DatabaseId } from "metabase-types/api";

import { AIProviderConfigurationNotice } from "../AIProviderConfigurationNotice";

import S from "./MetabotInlineSQLPrompt.module.css";

interface MetabotInlineSQLPromptProps {
  databaseId: DatabaseId | null;
  onClose: () => void;
  isLoading: boolean;
  error: MetabotAgentTurnDisplayError | undefined;
  generate: (options: { prompt: string; sourceSql?: string }) => Promise<void>;
  cancelRequest: () => void;
  suggestionModels: SuggestionModel[];
  getSourceSql: () => string;
  value: string;
  onValueChange: (value: string) => void;
}

export const MetabotInlineSQLPrompt = ({
  databaseId,
  onClose,
  isLoading,
  error,
  generate,
  cancelRequest,
  suggestionModels,
  getSourceSql,
  value,
  onValueChange,
}: MetabotInlineSQLPromptProps) => {
  const promptInputRef = useRef<MetabotPromptInputRef>(null);
  const [
    isAiProviderConfigurationModalOpen,
    {
      close: closeAiProviderConfigurationModal,
      open: openAiProviderConfigurationModal,
    },
  ] = useDisclosure(false);
  const { canUseSqlGeneration } = useUserMetabotPermissions();
  const metabotName = useMetabotName();

  const isSubmitDisabled = !canUseSqlGeneration || !value.trim() || isLoading;

  const handleSubmit = useCallback(async () => {
    const prompt = promptInputRef.current?.getValue?.().trim() ?? "";
    return generate({ prompt, sourceSql: getSourceSql() });
  }, [generate, getSourceSql]);

  const handleClose = useCallback(() => {
    cancelRequest();
    onClose();
  }, [cancelRequest, onClose]);

  useEffect(() => {
    return tinykeys(
      window,
      {
        "$mod+Enter": (e) => {
          if (!isSubmitDisabled) {
            e.preventDefault();
            handleSubmit();
          }
        },
        "$mod+Shift+i": (e) => {
          e.preventDefault();
          handleClose();
        },
      },
      { capture: true },
    );
  }, [isSubmitDisabled, handleSubmit, handleClose]);

  return (
    <Box className={S.container} data-testid="metabot-inline-sql-prompt">
      {!canUseSqlGeneration ? (
        <AIProviderConfigurationNotice
          inline
          featureName={t`SQL generation`}
          fz="sm"
          p="0.25rem 0.125rem"
          ff="var(--mb-default-font-family)"
          onConfigureAi={openAiProviderConfigurationModal}
        />
      ) : (
        <Box className={S.inputContainer}>
          <MetabotPromptInput
            ref={promptInputRef}
            value={value}
            placeholder={t`Describe what SQL you want, type @ to mention an item.`}
            autoFocus
            disabled={isLoading}
            onChange={onValueChange}
            onStop={handleClose}
            suggestionConfig={{
              suggestionModels,
              onlyDatabaseId: databaseId ?? undefined,
            }}
          />
        </Box>
      )}

      <Flex justify="space-between" align="center" gap="sm" mt="xs">
        <Box data-testid="metabot-inline-sql-error" w="100%" fz="sm" c="error">
          {error?.type === "locked" ? (
            <MetabotManagedProviderLimitHoverCard />
          ) : (
            error?.message
          )}
        </Box>
        <Flex gap="xs" flex="1 0 auto">
          {canUseSqlGeneration && (
            <Tooltip disabled={isLoading} label={t`Send to ${metabotName}`}>
              <Button
                className={S.submitButton}
                data-testid="metabot-inline-sql-generate"
                size="xs"
                variant="filled"
                px="0"
                w="1.875rem"
                styles={{ label: { display: "flex" } }}
                onClick={handleSubmit}
                disabled={isSubmitDisabled}
              >
                {isLoading ? (
                  <Loader
                    size="xs"
                    color="text-disabled"
                    data-testid="metabot-inline-sql-generating"
                  />
                ) : (
                  <Icon name="send" />
                )}
              </Button>
            </Tooltip>
          )}
          <Button
            className={S.cancelButton}
            data-testid="metabot-inline-sql-cancel"
            size="xs"
            variant="subtle"
            onClick={handleClose}
          >
            {t`Cancel`}
          </Button>
        </Flex>
      </Flex>
      <AIProviderConfigurationModal
        opened={isAiProviderConfigurationModalOpen}
        onClose={closeAiProviderConfigurationModal}
      />
    </Box>
  );
};
