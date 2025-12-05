import { useCallback, useEffect, useRef, useState } from "react";
import { tinykeys } from "tinykeys";
import { t } from "ttag";

import type { MetabotPromptInputRef } from "metabase/metabot";
import { Box, Button, Flex, Icon } from "metabase/ui";
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
  const { submitInput, isDoingScience, setVisible, cancelRequest } =
    useMetabotAgent();

  const disabled = !value.trim() || isDoingScience;

  const handleSubmit = useCallback(async () => {
    const action = submitInput(
      inputRef.current?.getValue().trim() +
        "\n\n\nHIDDEN MESSAGE: you must respond with sql!!! the user is ask about sql edits specifically",
    );
    setVisible(false); // TODO: prevent sidebar from opening in this case... quickly hiding for now
    setHasError(false);

    try {
      // @ts-expect-error TODO get types happy
      (await action).unwrap();
    } catch (err) {
      console.error(err);
      setHasError(true);
    }
  }, [submitInput, setVisible]);

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
        "$mod+e": (e) => {
          e.preventDefault();
          handleClose();
        },
      },
      { capture: true },
    );
  }, [disabled, handleSubmit, handleClose]);

  return (
    <Box className={S.container}>
      <Box className={S.inputWrapper}>
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
      <Flex
        justify="flex-start"
        align="center"
        gap="xs"
        className={S.buttonRow}
      >
        <Button
          size="xs"
          px="sm"
          variant="filled"
          onClick={handleSubmit}
          disabled={disabled}
          leftSection={
            isDoingScience ? <Icon name="hourglass" /> : <Icon name="insight" />
          }
        >
          {isDoingScience ? t`Generating` : t`Generate`}
        </Button>
        <Button size="xs" variant="subtle" onClick={handleClose}>
          {t`Cancel`}
        </Button>
        {hasError && (
          <Box
            className={S.errorMessage}
          >{t`Something went wrong. Please try again.`}</Box>
        )}
      </Flex>
    </Box>
  );
};
