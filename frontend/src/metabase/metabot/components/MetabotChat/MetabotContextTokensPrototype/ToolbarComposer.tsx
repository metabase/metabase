// PROTOTYPE: metabot context tokens — variant 2 "Toolbar"
// Text gets the full width on top; context lives as compact chips in a bottom
// toolbar that shares a row with + and Send. The viewed entity is a tinted
// "ambient" chip; @-mentions are outlined and mirror the inline mentions.
import cx from "classnames";
import { useMemo } from "react";

import { Icon, Text } from "metabase/ui";

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
  getMentionTokens,
  mergeTokens,
  removeMentionFromPrompt,
} from "./tokens";
import { useContextTokenDisplay } from "./use-context-token-display";
import { useViewingToken } from "./use-viewing-token";

export function ToolbarComposer(props: ContextComposerProps) {
  const { prompt, onPromptChange, promptInputRef, isResponding } = props;
  const { viewingToken, dismissViewingToken } = useViewingToken();
  const tokens = useMemo(
    () => mergeTokens(viewingToken, getMentionTokens(prompt)),
    [viewingToken, prompt],
  );
  useComposerBridge(props, tokens, props.onSubmit);

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
      <div className={S.toolbarEditor}>
        <ComposerEditor {...props} />
      </div>
      <div className={S.toolbarRow}>
        <div className={S.chipList}>
          {tokens.map((token) => (
            <ContextChip
              key={token.key}
              token={token}
              onRemove={() => handleRemove(token)}
            />
          ))}
        </div>
        <ComposerActions {...props} />
      </div>
    </ComposerShell>
  );
}

function ContextChip({
  token,
  onRemove,
}: {
  token: ContextToken;
  onRemove: () => void;
}) {
  const { name, typeLabel, icon } = useContextTokenDisplay(token);

  return (
    <div
      className={cx(
        S.token,
        S.chip,
        token.source === "viewing" && S.chipViewing,
      )}
      title={`${typeLabel}: ${name}`}
    >
      <Icon name={icon.name} size={14} />
      <Text fz="sm" fw={500} lh="1rem" c="text-primary" truncate>
        {name}
      </Text>
      <TokenRemoveButton name={name} onRemove={onRemove} />
    </div>
  );
}
