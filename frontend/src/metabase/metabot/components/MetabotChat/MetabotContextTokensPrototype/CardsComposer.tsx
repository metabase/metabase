// PROTOTYPE: metabot context tokens — variant 1 "Cards"
// Dia-style two-line cards in a scrolling row at the top of the composer.
// @-mentions stay inline in the text and are mirrored as cards; removing a
// mention card removes the inline mention.
import cx from "classnames";
import { useMemo } from "react";

import { Icon, Text } from "metabase/ui";

import {
  ComposerActions,
  ComposerEditor,
  ComposerShell,
  type ContextComposerProps,
  TokenRemoveButton,
} from "./ContextComposerParts";
import S from "./ContextTokens.module.css";
import {
  type ContextToken,
  getMentionTokens,
  mergeTokens,
  removeMentionFromPrompt,
} from "./tokens";
import { useContextTokenDisplay } from "./use-context-token-display";
import { useViewingToken } from "./use-viewing-token";

export function CardsComposer(props: ContextComposerProps) {
  const { prompt, onPromptChange, promptInputRef, isResponding } = props;
  const { viewingToken, dismissViewingToken } = useViewingToken();
  const tokens = useMemo(
    () => mergeTokens(viewingToken, getMentionTokens(prompt)),
    [viewingToken, prompt],
  );

  const handleRemove = (token: ContextToken) => {
    if (token.source === "viewing") {
      dismissViewingToken();
    } else {
      onPromptChange(removeMentionFromPrompt(prompt, token));
    }
    promptInputRef?.current?.focus();
  };

  return (
    <ComposerShell isResponding={isResponding}>
      {tokens.length > 0 && (
        <div className={S.cardRow}>
          {tokens.map((token) => (
            <ContextCard
              key={token.key}
              token={token}
              onRemove={() => handleRemove(token)}
            />
          ))}
        </div>
      )}
      <div className={S.cardEditorRow}>
        <ComposerEditor {...props} />
        <ComposerActions {...props} />
      </div>
    </ComposerShell>
  );
}

function ContextCard({
  token,
  onRemove,
}: {
  token: ContextToken;
  onRemove: () => void;
}) {
  const { name, typeLabel, collectionName, icon } =
    useContextTokenDisplay(token);

  return (
    <div className={cx(S.token, S.card)} title={name}>
      <div className={S.cardTile}>
        <Icon name={icon.name} size={16} />
      </div>
      <div className={S.cardText}>
        <Text fz="sm" fw="bold" lh="1.25rem" c="text-primary" truncate>
          {name}
        </Text>
        <Text fz="xs" lh="1rem" c="text-secondary" truncate>
          {collectionName ? `${typeLabel} · ${collectionName}` : typeLabel}
        </Text>
      </div>
      <TokenRemoveButton name={name} onRemove={onRemove} />
    </div>
  );
}
