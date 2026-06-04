import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import { useMetabotContext } from "metabase/metabot";
import { trackMetabotChatOpened } from "metabase/metabot/analytics";
import {
  getViewingEntityMention,
  useAskMetabotAboutCurrentEntity,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import { Button, Icon } from "metabase/ui";

import S from "./MetabotEntityLauncher.module.css";

/**
 * A button that appears whenever the user is viewing something Metabot can
 * talk about (a question, dashboard, model, document, or transform). Clicking
 * it opens a fresh fullscreen Metabot chat with the currently-viewed entity
 * already @mentioned in the prompt.
 *
 * It hides itself on pages with nothing mentionable — including the Metabot
 * chat page itself — so it only shows up where "ask about this" makes sense.
 */
export function MetabotEntityLauncher() {
  const { hasMetabotAccess } = useUserMetabotPermissions();
  const { getChatContext, chatContextProviderVersion } = useMetabotContext();
  const askMetabotAboutCurrentEntity = useAskMetabotAboutCurrentEntity();

  const [hasMentionableEntity, setHasMentionableEntity] = useState(false);

  useEffect(() => {
    if (!hasMetabotAccess) {
      setHasMentionableEntity(false);
      return;
    }
    let cancelled = false;
    getChatContext().then((context) => {
      if (!cancelled) {
        setHasMentionableEntity(getViewingEntityMention(context) != null);
      }
    });
    return () => {
      cancelled = true;
    };
    // `chatContextProviderVersion` changes whenever the registered "user is
    // viewing" providers change (i.e. when the user navigates to/from an
    // entity), so we re-check what's mentionable on every such change.
  }, [hasMetabotAccess, getChatContext, chatContextProviderVersion]);

  const handleClick = useCallback(() => {
    askMetabotAboutCurrentEntity();
    trackMetabotChatOpened("header");
  }, [askMetabotAboutCurrentEntity]);

  if (!hasMetabotAccess || !hasMentionableEntity) {
    return null;
  }

  return (
    <div className={S.bar}>
      <Button
        variant="subtle"
        size="xs"
        leftSection={<Icon name="metabot" size={14} />}
        aria-label={t`Ask Metabot about this`}
        data-testid="metabot-entity-launcher"
        onClick={handleClick}
      >
        {t`Ask Metabot about this`}
      </Button>
    </div>
  );
}
