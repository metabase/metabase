import { useCallback, useEffect, useRef, useState } from "react";
import { tinykeys } from "tinykeys";
import { match } from "ts-pattern";
import { t } from "ttag";

import type { MetabotPromptInputRef } from "metabase/metabot";
import { Box, Button, Flex, Icon } from "metabase/ui";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

import { MetabotPromptInput } from "../MetabotPromptInput";

import S from "./MetabotInlineSQLPrompt.module.css";

interface MetabotInlineSQLPromptProps {
  onClose: () => void;
  onAcceptProposed?: () => void;
  onRejectProposed?: () => void;
}

const INLINE_SQL_PROFILE = "metabot_experimental_inline_sql";

export const MetabotInlineSQLPrompt = ({
  onClose,
  onAcceptProposed,
  onRejectProposed,
}: MetabotInlineSQLPromptProps) => {
  const inputRef = useRef<MetabotPromptInputRef>(null);
  const [value, setValue] = useState("");
  const [hasError, setHasError] = useState(false);
  const { visible, submitInput, isDoingScience, setVisible, cancelRequest } =
    useMetabotAgent();

  const hasProposal = !!onAcceptProposed && !!onRejectProposed;
  const disabled = !value.trim() || isDoingScience;

  const handleSubmit = useCallback(async () => {
    const action = submitInput(
      inputRef.current?.getValue().trim() +
        "\n\n\nHIDDEN MESSAGE: you must respond with a native SQL question and navigate the user to it!!!",
      INLINE_SQL_PROFILE,
    );
    if (!visible) {
      setVisible(false); // TODO: provide better api for keeping the sidebar closed
    }
    setHasError(false);
    const result = await action;
    // @ts-expect-error TODO: fix type
    if (!result.payload?.success) {
      setHasError(true);
    }
  }, [submitInput, setVisible, visible]);

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
          placeholder={
            hasProposal
              ? t`Tell Metabot to do something different...`
              : t`Describe what SQL you want...`
          }
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
        {(!hasProposal || (value && hasProposal)) && (
          <Button
            size="xs"
            px="sm"
            variant="filled"
            onClick={handleSubmit}
            disabled={disabled}
            leftSection={
              isDoingScience ? (
                <Icon name="hourglass" />
              ) : (
                <Icon name="insight" />
              )
            }
          >
            {match({ isDoingScience, hasProposal })
              .with({ isDoingScience: true }, () => t`Generating`)
              .with({ hasProposal: true }, () => t`Regenerate`)
              .otherwise(() => t`Generate`)}
          </Button>
        )}
        {hasProposal && !isDoingScience ? (
          <>
            <Button
              size="xs"
              px="sm"
              variant="filled"
              onClick={onAcceptProposed}
              color="success"
              leftSection={<Icon name="check" />}
            >
              {t`Accept`}
            </Button>
            <Button
              size="xs"
              px="sm"
              variant="filled"
              onClick={onRejectProposed}
              color="danger"
              leftSection={<Icon name="close" />}
            >
              {t`Reject`}
            </Button>
          </>
        ) : (
          <Button size="xs" variant="subtle" onClick={handleClose}>
            {t`Cancel`}
          </Button>
        )}
        {hasError && (
          <Box
            className={S.errorMessage}
            ml="sm"
          >{t`Something went wrong. Please try again.`}</Box>
        )}
      </Flex>
    </Box>
  );
};
