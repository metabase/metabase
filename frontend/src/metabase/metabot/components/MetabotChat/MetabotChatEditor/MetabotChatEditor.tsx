import { useMergedRef } from "@mantine/hooks";
import { forwardRef, useEffect, useRef } from "react";

import type { MetabotPromptInputRef } from "metabase/metabot";
import { useGetMetabotDictationQuery } from "metabase/metabot/api";
import { MetabotDictationActions } from "metabase/metabot/components/MetabotDictation/MetabotDictationActions";
import {
  MetabotPromptInput,
  type MetabotPromptInputProps,
} from "metabase/metabot/components/MetabotPromptInput";
import { useMetabotDictation } from "metabase/metabot/hooks/use-metabot-dictation";
import { Box } from "metabase/ui";

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
> & { isResponding?: boolean; allowDictation?: boolean };

export const MetabotChatEditor = forwardRef<
  MetabotPromptInputRef | null,
  MetabotChatEditorProps
>(function MetabotChatEditor(
  { isResponding = false, allowDictation = false, ...props },
  ref,
) {
  const inputRef = useRef<MetabotPromptInputRef>(null);
  const mergedRef = useMergedRef(inputRef, ref);
  const selectionRef = useRef<
    | ReturnType<
        NonNullable<MetabotPromptInputRef["captureDictationSelection"]>
      >
    | undefined
  >();
  const { data } = useGetMetabotDictationQuery(undefined, {
    skip: !allowDictation,
    refetchOnMountOrArgChange: true,
  });
  const dictation = useMetabotDictation((text, send) => {
    const value = selectionRef.current?.insert(text);
    selectionRef.current = undefined;
    if (send && value?.trim()) {
      props.onSubmit?.(value);
    }
  });
  const active = dictation.state.status !== "idle";
  const cancelDictation = dictation.cancel;
  useEffect(() => {
    if (isResponding && active) {
      cancelDictation();
      selectionRef.current = undefined;
    }
  }, [isResponding, active, cancelDictation]);
  const start = () => {
    selectionRef.current = inputRef.current?.captureDictationSelection?.();
    void dictation.start();
  };
  const cancel = () => {
    dictation.cancel();
    selectionRef.current?.restore();
    selectionRef.current = undefined;
  };
  const send = () => {
    if (dictation.state.status === "recording") {
      dictation.stop(true);
    } else if (!active && !isResponding) {
      props.onSubmit?.(inputRef.current?.getValue?.() ?? props.value);
    }
  };

  return (
    <Box
      className={S.editorContainer}
      onKeyDown={(event) => {
        if (active && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          cancel();
        }
      }}
    >
      <Box className={S.contentWrapper}>
        <MetabotPromptInput
          {...props}
          ref={mergedRef}
          disabled={isResponding}
          readOnly={active}
          onSubmit={active ? undefined : props.onSubmit}
          data-testid="metabot-chat-input"
        />
      </Box>
      <MetabotDictationActions
        state={dictation.state}
        available={allowDictation && !!data?.enabled}
        isResponding={isResponding}
        canSend={props.value.trim().length > 0}
        onStart={start}
        onCancel={cancel}
        onStop={() => dictation.stop(false)}
        onSend={send}
        onRetry={dictation.retry}
        onStopResponse={props.onStop}
      />
    </Box>
  );
});
