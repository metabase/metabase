// PROTOTYPE: metabot context tokens
import cx from "classnames";
import type { ReactNode, RefObject } from "react";
import { t } from "ttag";

import type { MetabotPromptInputRef } from "metabase/metabot";
import { MetabotPromptInput } from "metabase/metabot/components/MetabotPromptInput";
import { MetabotSendButton } from "metabase/metabot/components/MetabotSendButton";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import { ActionIcon, Icon, Paper, Tooltip } from "metabase/ui";

import type { MentionProps } from "../../editor-extensions/MetabotMention/MetabotMentionExtension";

import S from "./ContextTokens.module.css";

export type ContextComposerProps = {
  prompt: string;
  onPromptChange: (prompt: string) => void;
  promptInputRef: RefObject<MetabotPromptInputRef | null> | undefined;
  isResponding: boolean;
  onSubmit: (message: string) => void;
  onStop: () => void;
  suggestionModels: SuggestionModel[];
};

export function ComposerShell({
  isResponding,
  children,
}: {
  isResponding: boolean;
  children: ReactNode;
}) {
  return (
    <Paper
      className={cx(S.composer, isResponding && S.composerResponding)}
      data-testid="metabot-context-composer"
    >
      {children}
    </Paper>
  );
}

export function ComposerEditor({
  prompt,
  onPromptChange,
  promptInputRef,
  isResponding,
  onSubmit,
  onStop,
  suggestionModels,
  placeholder,
  onMentionSelect,
}: ContextComposerProps & {
  placeholder?: string;
  onMentionSelect?: (mention: MentionProps) => void;
}) {
  return (
    <div className={S.editor}>
      <MetabotPromptInput
        ref={promptInputRef}
        value={prompt}
        placeholder={placeholder}
        autoFocus
        disabled={isResponding}
        onChange={onPromptChange}
        onSubmit={() => onSubmit(prompt)}
        onStop={onStop}
        onMentionSelect={onMentionSelect}
        suggestionConfig={{ suggestionModels }}
        data-testid="metabot-chat-input"
      />
    </div>
  );
}

export function ComposerActions({
  prompt,
  promptInputRef,
  isResponding,
  onSubmit,
  onStop,
}: Pick<
  ContextComposerProps,
  "prompt" | "promptInputRef" | "isResponding" | "onSubmit" | "onStop"
>) {
  return (
    <div className={S.actions}>
      <Tooltip label={t`Add context`}>
        <ActionIcon
          variant="subtle"
          c="text-secondary"
          aria-label={t`Add context`}
          disabled={isResponding}
          // keep the editor's selection so "@" lands at the cursor
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => promptInputRef?.current?.openMentionMenu?.()}
        >
          <Icon name="add" size={16} />
        </ActionIcon>
      </Tooltip>
      <MetabotSendButton
        isResponding={isResponding}
        disabled={!isResponding && prompt.trim().length === 0}
        onClick={isResponding ? onStop : () => onSubmit(prompt)}
      />
    </div>
  );
}

export function TokenRemoveButton({
  name,
  onRemove,
}: {
  name: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      className={S.remove}
      aria-label={t`Remove ${name}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onRemove}
    >
      <Icon name="close" size={8} />
    </button>
  );
}
