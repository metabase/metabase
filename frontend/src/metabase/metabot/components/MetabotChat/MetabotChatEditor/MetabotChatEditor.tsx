import { useMergedRef } from "@mantine/hooks";
import { forwardRef, useEffect, useRef, useState } from "react";
import { t } from "ttag";

import type { MetabotPromptInputRef } from "metabase/metabot";
import { useGetMetabotDictationQuery } from "metabase/metabot/api";
import { MetabotAttachmentDraft } from "metabase/metabot/components/MetabotAttachmentDraft";
import { MetabotDictationActions } from "metabase/metabot/components/MetabotDictation/MetabotDictationActions";
import {
  MetabotPromptInput,
  type MetabotPromptInputProps,
} from "metabase/metabot/components/MetabotPromptInput";
import { MetabotReasoningEffort } from "metabase/metabot/components/MetabotReasoningEffort";
import type { MetabotAttachmentsController } from "metabase/metabot/hooks/use-metabot-attachments";
import type { MetabotReasoningEffortController } from "metabase/metabot/hooks/use-metabot-conversation";
import { useMetabotDictation } from "metabase/metabot/hooks/use-metabot-dictation";
import { UPLOAD_DATA_FILE_TYPES } from "metabase/redux/uploads";
import { ActionIcon, Box, Icon, Menu, Tooltip } from "metabase/ui";
import type { IconName } from "metabase-types/api";

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
  allowDictation?: boolean;
  attachments?: MetabotAttachmentsController;
  reasoningEffort?: MetabotReasoningEffortController;
};

export const MetabotChatEditor = forwardRef<
  MetabotPromptInputRef | null,
  MetabotChatEditorProps
>(function MetabotChatEditor(
  {
    isResponding = false,
    allowDictation = false,
    attachments,
    reasoningEffort,
    ...props
  },
  ref,
) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const uploading = attachments?.draft.status === "uploading";
  const busy =
    isResponding ||
    (attachments?.draft.status !== undefined &&
      attachments.draft.status !== "idle");
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
    } else if (!active && !busy) {
      props.onSubmit?.(inputRef.current?.getValue?.() ?? props.value);
    }
  };
  const actions: {
    key: string;
    label: string;
    icon: IconName;
    onClick: () => void;
  }[] = [];
  if (attachments?.available) {
    actions.push({
      key: "attachments",
      label: t`Add attachments`,
      icon: "attachment",
      onClick: () => fileInputRef.current?.click(),
    });
  }

  return (
    <Box
      className={S.editorContainer}
      data-dragging={dragging || undefined}
      onDragOver={(event) => {
        if (
          attachments?.supported &&
          event.dataTransfer.types.includes("Files")
        ) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(event) => {
        if (
          !event.currentTarget.contains(
            event.relatedTarget instanceof Node ? event.relatedTarget : null,
          )
        ) {
          setDragging(false);
        }
      }}
      onDrop={(event) => {
        if (attachments?.supported && event.dataTransfer.files.length > 0) {
          event.preventDefault();
          setDragging(false);
          if (!busy && !active) {
            attachments.addFiles(Array.from(event.dataTransfer.files));
          }
        }
      }}
      onPasteCapture={(event) => {
        if (attachments?.supported && event.clipboardData.files.length > 0) {
          event.preventDefault();
          if (!busy && !active) {
            attachments.addFiles(Array.from(event.clipboardData.files));
          }
        }
      }}
      onKeyDown={(event) => {
        if (active && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          cancel();
        }
      }}
    >
      {attachments?.supported &&
        attachments.draft.status !== "sending" &&
        (attachments.draft.files.length > 0 || attachments.draft.error) && (
          <MetabotAttachmentDraft controller={attachments} />
        )}
      <Box className={S.contentWrapper}>
        <MetabotPromptInput
          {...props}
          ref={mergedRef}
          disabled={busy}
          readOnly={active}
          onSubmit={active || busy ? undefined : props.onSubmit}
          data-testid="metabot-chat-input"
        />
      </Box>
      <MetabotDictationActions
        leadingAction={
          actions.length > 0 && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={UPLOAD_DATA_FILE_TYPES.join(",")}
                hidden
                aria-label={t`Attach files`}
                onChange={(event) => {
                  attachments?.addFiles(Array.from(event.target.files ?? []));
                  event.target.value = "";
                }}
              />
              <Menu position="top-start" shadow="md" width={220}>
                <Menu.Target>
                  <Tooltip label={t`More actions`}>
                    <ActionIcon
                      aria-label={t`More actions`}
                      variant="subtle"
                      size={28}
                      disabled={busy || active}
                    >
                      <Icon name="add" size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Menu.Target>
                <Menu.Dropdown>
                  {actions.map(({ key, label, icon, onClick }) => (
                    <Menu.Item
                      key={key}
                      leftSection={<Icon name={icon} size={16} />}
                      disabled={busy || active}
                      onClick={onClick}
                    >
                      {label}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            </>
          )
        }
        trailingAction={
          reasoningEffort?.supported && (
            <MetabotReasoningEffort
              value={reasoningEffort.value}
              onChange={reasoningEffort.setValue}
              disabled={busy}
            />
          )
        }
        state={dictation.state}
        available={allowDictation && !!data?.enabled && !uploading}
        isResponding={isResponding}
        canSend={
          !busy &&
          (props.value.trim().length > 0 || !!attachments?.draft.files.length)
        }
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
