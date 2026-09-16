import type { ReactNode } from "react";
import { t } from "ttag";

import type { DictationState } from "metabase/metabot/hooks/use-metabot-dictation";
import {
  ActionIcon,
  Box,
  Button,
  Icon,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

import { DictationWaveform } from "./DictationWaveform";
import S from "./MetabotDictation.module.css";

type Props = {
  leadingAction?: ReactNode;
  trailingAction?: ReactNode;
  state: DictationState;
  available: boolean;
  isResponding: boolean;
  canSend: boolean;
  onStart: () => void;
  onCancel: () => void;
  onStop: () => void;
  onSend: () => void;
  onRetry: () => void;
  onStopResponse: () => void;
};

function Control({
  label,
  icon,
  onClick,
  disabled,
  primary,
  testId,
}: {
  label: string;
  icon: IconName;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  testId?: string;
}) {
  return (
    <Tooltip label={label}>
      <ActionIcon
        aria-label={label}
        size={28}
        variant={primary ? "filled" : "subtle"}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClick}
        data-testid={testId}
      >
        <Icon name={icon} size={14} />
      </ActionIcon>
    </Tooltip>
  );
}

export function MetabotDictationActions({
  leadingAction,
  trailingAction,
  state,
  available,
  isResponding,
  canSend,
  onStart,
  onCancel,
  onStop,
  onSend,
  onRetry,
  onStopResponse,
}: Props) {
  const active = state.status !== "idle";
  return (
    <Stack gap="xs">
      {state.status === "error" && (
        <Text role="alert" c="error" size="sm">
          {state.message}
        </Text>
      )}
      <Box className={S.actions}>
        {leadingAction && <Box mr="auto">{leadingAction}</Box>}
        {active ? (
          <>
            <Control
              label={t`Cancel dictation`}
              icon="close"
              onClick={onCancel}
            />
            {state.status === "recording" ? (
              <>
                <span
                  role="status"
                  className={S.recordingStatus}
                >{t`Recording audio`}</span>
                <DictationWaveform stream={state.stream} />
              </>
            ) : (
              <Text
                className={S.status}
                role="status"
                size="sm"
                c="text-secondary"
              >
                {state.status === "requesting"
                  ? t`Waiting for microphone permission…`
                  : state.status === "transcribing"
                    ? t`Transcribing…`
                    : ""}
              </Text>
            )}
            {state.status === "recording" && (
              <>
                <Control
                  label={t`Stop dictation`}
                  icon="stop_outline"
                  onClick={onStop}
                />
                <Control
                  label={t`Send`}
                  icon="arrow_up"
                  onClick={onSend}
                  primary
                  testId="metabot-send-message"
                />
              </>
            )}
            {state.status === "error" && state.canRetry && (
              <Button size="xs" onClick={onRetry}>{t`Retry`}</Button>
            )}
          </>
        ) : (
          <>
            {trailingAction}
            {available && (
              <Control
                label={t`Dictate`}
                icon="microphone"
                onClick={onStart}
                disabled={isResponding}
              />
            )}
            {isResponding ? (
              <Control
                label={t`Stop response`}
                icon="stop"
                onClick={onStopResponse}
                testId="metabot-stop-response"
              />
            ) : (
              <Control
                label={t`Send`}
                icon="arrow_up"
                onClick={onSend}
                disabled={!canSend}
                primary
                testId="metabot-send-message"
              />
            )}
          </>
        )}
      </Box>
    </Stack>
  );
}
