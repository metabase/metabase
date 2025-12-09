import { isFulfilled, isRejected } from "@reduxjs/toolkit";
import { useCallback, useEffect, useRef, useState } from "react";
import { tinykeys } from "tinykeys";
import { match } from "ts-pattern";
import { t } from "ttag";

import type { MetabotPromptInputRef } from "metabase/metabot";
import { Box, Button, Flex, Icon } from "metabase/ui";
import { METABOT_PROFILE_OVERRIDES } from "metabase-enterprise/metabot/constants";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

import { MetabotPromptInput } from "../MetabotPromptInput";

import S from "./MetabotInlineSQLPrompt.module.css";

interface MetabotInlineSQLPromptProps {
  proposedSQL: string | undefined;
  onClose: () => void;
  onAcceptProposed?: () => void;
  onRejectProposed?: () => void;
}

export const MetabotInlineSQLPrompt = ({
  proposedSQL,
  onClose,
  onAcceptProposed,
  onRejectProposed,
}: MetabotInlineSQLPromptProps) => {
  const inputRef = useRef<MetabotPromptInputRef>(null);
  const [value, setValue] = useState("");
  const [hasError, setHasError] = useState(false);
  const { isDoingScience, submitInput, addDeveloperMessage, cancelRequest } =
    useMetabotAgent();

  const hasProposal = !!proposedSQL && !!onAcceptProposed && !!onRejectProposed;
  const disabled = !value.trim() || isDoingScience;

  const handleSubmit = useCallback(async () => {
    const value = inputRef.current?.getValue?.().trim() ?? "";
    setHasError(false);
    if (hasProposal) {
      addDeveloperMessage(
        `User rejected the following suggestion:\n\n${proposedSQL}`,
      );
    }
    const action = await submitInput(value, {
      profile: METABOT_PROFILE_OVERRIDES.INLINE_SQL,
      preventOpenSidebar: true,
    });
    if (
      (isFulfilled(action) && !action.payload?.success) ||
      !isRejected(action)
    ) {
      setHasError(true);
    }
  }, [submitInput, addDeveloperMessage, hasProposal, proposedSQL]);

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
      <Box className={S.inputContainer}>
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
      <Flex justify="flex-start" align="center" gap="xs" mt="xs">
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
        {hasProposal ? (
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
            fz="sm"
            c="error"
            ml="sm"
          >{t`Something went wrong. Please try again.`}</Box>
        )}
      </Flex>
    </Box>
  );
};
