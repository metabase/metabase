// PROTOTYPE: metabot context tokens — variant 3 "Attachments"
// Picking an @-mention lifts it out of the text and attaches it as a token, so
// the prompt stays plain prose. Attachments ride along with the next message
// (appended as mention links) and clear once it's sent.
import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import { Icon, Text } from "metabase/ui";

import type { MentionProps } from "../../editor-extensions/MetabotMention/MetabotMentionExtension";

import {
  ComposerActions,
  ComposerEditor,
  ComposerShell,
  type ContextComposerProps,
  TokenRemoveButton,
  useComposerBridge,
} from "./ContextComposerParts";
import S from "./ContextTokens.module.css";
import {
  type ContextToken,
  mentionToToken,
  mergeTokens,
  tokenToMentionLink,
} from "./tokens";
import { useContextTokenDisplay } from "./use-context-token-display";
import { useViewingToken } from "./use-viewing-token";

export function AttachmentsComposer(props: ContextComposerProps) {
  const { promptInputRef, isResponding, onSubmit } = props;
  const { viewingToken, dismissViewingToken } = useViewingToken();
  const [attachments, setAttachments] = useState<ContextToken[]>([]);
  const tokens = mergeTokens(viewingToken, attachments);

  const handleMentionSelect = (mention: MentionProps) => {
    const token = mentionToToken(mention);
    if (token) {
      setAttachments((current) =>
        current.some(({ key }) => key === token.key)
          ? current
          : [...current, token],
      );
    }
  };

  const handleRemove = (token: ContextToken) => {
    if (token.source === "viewing") {
      dismissViewingToken();
    } else {
      setAttachments((current) =>
        current.filter(({ key }) => key !== token.key),
      );
    }
    promptInputRef?.current?.focus();
  };

  const handleSubmit = (message: string) => {
    const links = attachments.flatMap((token) => {
      const link = tokenToMentionLink(token);
      return link ? [link] : [];
    });
    onSubmit(links.length > 0 ? `${message}\n\n${links.join(" ")}` : message);
    setAttachments([]);
  };
  useComposerBridge(props, tokens, handleSubmit);

  const composerProps = { ...props, onSubmit: handleSubmit };

  return (
    <ComposerShell isResponding={isResponding}>
      {tokens.length > 0 && (
        <div className={S.attachmentList}>
          {tokens.map((token) => (
            <Attachment
              key={token.key}
              token={token}
              onRemove={() => handleRemove(token)}
            />
          ))}
        </div>
      )}
      <div className={S.attachmentEditorRow}>
        <ComposerEditor
          {...composerProps}
          placeholder={t`Ask about your data. Type @ to add context.`}
          onMentionSelect={handleMentionSelect}
        />
        <ComposerActions {...composerProps} />
      </div>
    </ComposerShell>
  );
}

function Attachment({
  token,
  onRemove,
}: {
  token: ContextToken;
  onRemove: () => void;
}) {
  const { name, typeLabel, icon } = useContextTokenDisplay(token);

  return (
    <div className={cx(S.token, S.attachment)} title={`${typeLabel}: ${name}`}>
      <span className={S.attachmentIcon}>
        <Icon name={icon.name} size={12} />
      </span>
      <Text fz="sm" fw={500} lh="1rem" c="text-primary" truncate>
        {name}
      </Text>
      <TokenRemoveButton name={name} onRemove={onRemove} />
    </div>
  );
}
