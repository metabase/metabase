import { isFulfilled, isRejected } from "@reduxjs/toolkit";
import { useCallback, useEffect, useRef, useState } from "react";
import { tinykeys } from "tinykeys";
import { t } from "ttag";

import type { MetabotPromptInputRef } from "metabase/metabot";
import { Box, Button, Flex, Icon, Loader } from "metabase/ui";
import { METABOT_PROFILE_OVERRIDES } from "metabase-enterprise/metabot/constants";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

import { MetabotPromptInput } from "../MetabotPromptInput";

import S from "./MetabotInlineSQLPrompt.module.css";

interface MetabotInlineSQLPromptProps {
  onClose: () => void;
}

export const MetabotInlineSQLPrompt = ({
  onClose,
}: MetabotInlineSQLPromptProps) => {
  const inputRef = useRef<MetabotPromptInputRef>(null);
  const [value, setValue] = useState("");
  const [hasError, setHasError] = useState(false);
  const { isDoingScience, submitInput, cancelRequest } = useMetabotAgent();

  const disabled = !value.trim() || isDoingScience;

  const handleSubmit = useCallback(async () => {
    const value = inputRef.current?.getValue?.().trim() ?? "";
    setHasError(false);
    const action = await submitInput(value, {
      profile: METABOT_PROFILE_OVERRIDES.SQL,
      preventOpenSidebar: true,
    });
    if (
      (isFulfilled(action) && !action.payload?.success) ||
      !isRejected(action)
    ) {
      setHasError(true);
    }
  }, [submitInput]);

  const handleClose = useCallback(() => {
    cancelRequest();
    onClose();
  }, [cancelRequest, onClose]);

  useEffect(() => {
    return tinykeys(
      window,
      {
        "$mod+Enter": (e) => {
          if (!disabled) {
            e.preventDefault();
            handleSubmit();
          }
        },
        "$mod+;": (e) => {
          e.preventDefault();
          handleClose();
        },
      },
      { capture: true },
    );
  }, [disabled, handleSubmit, handleClose]);

  return (
    <Box className={S.container}>
      <Box className={S.inputContainer}>
        <MetabotPromptInput
          ref={inputRef}
          value={value}
          placeholder={t`Describe what SQL you want...`}
          autoFocus
          disabled={isDoingScience}
          suggestionModels={["dataset", "metric", "card", "table", "database"]}
          onChange={setValue}
          onStop={handleClose}
        />
      </Box>
      <Flex justify="flex-start" align="center" gap="xs" mt="xs">
        <Button
          size="xs"
          px="sm"
          variant="filled"
          onClick={handleSubmit}
          disabled={disabled}
          leftSection={
            isDoingScience ? (
              <Loader size="xs" color="text-light" />
            ) : (
              <Icon name="insight" />
            )
          }
        >
          {isDoingScience ? t`Generating...` : t`Generate`}
        </Button>
        <Button size="xs" variant="subtle" onClick={handleClose}>
          {t`Cancel`}
        </Button>
        {hasError && (
          <Box
            fz="sm"
            c="error"
            ml="sm"
          >{t`Something went wrong. Please try again.`}</Box>
        )}
      </Flex>
    </Box>
  );
};
