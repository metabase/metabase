import { useCallback } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useMetabotContext } from "metabase/metabot";
import { useDispatch } from "metabase/redux";
import { uuid } from "metabase/utils/uuid";
import type { MetabotChatContext } from "metabase-types/api";

import {
  type MetabotAgentId,
  createAgent,
  focusPromptInput,
  setPrompt,
} from "../state";
import {
  type MetabaseProtocolEntity,
  type MetabaseProtocolEntityModel,
  createMetabaseProtocolLink,
} from "../utils/links";

// Map the `type` reported in the Metabot "user is viewing" context onto the
// entity model understood by the metabase:// mention protocol. Types without a
// mapping (adhoc queries, metrics, the code editor) can't be @mentioned.
const MODEL_BY_VIEWING_TYPE: Partial<
  Record<string, MetabaseProtocolEntityModel>
> = {
  question: "question",
  model: "model",
  dashboard: "dashboard",
  document: "document",
  transform: "transform",
};

const fallbackLabel = (model: MetabaseProtocolEntityModel): string => {
  switch (model) {
    case "dashboard":
      return t`this dashboard`;
    case "document":
      return t`this document`;
    case "model":
      return t`this model`;
    case "transform":
      return t`this transform`;
    default:
      return t`this question`;
  }
};

/**
 * Find the first entity in the current Metabot chat context that can be
 * referenced with an @mention, returning the protocol entity to link to (or
 * `null` when nothing the user is viewing is mentionable).
 */
export const getViewingEntityMention = (
  context: MetabotChatContext,
): MetabaseProtocolEntity | null => {
  for (const entity of context.user_is_viewing ?? []) {
    const model = MODEL_BY_VIEWING_TYPE[entity.type];
    const id = "id" in entity ? entity.id : undefined;
    if (!model || id == null) {
      continue;
    }
    const name =
      "name" in entity && entity.name ? entity.name : fallbackLabel(model);
    return { id, model, name };
  }
  return null;
};

/**
 * Open a fresh fullscreen Metabot conversation, pre-seeding the prompt with an
 * @mention of whatever entity the user is currently viewing (a question,
 * dashboard, model, document, or transform). When nothing mentionable is in
 * view it simply opens an empty new chat.
 *
 * Returns the new agent id.
 */
export const useAskMetabotAboutCurrentEntity = () => {
  const dispatch = useDispatch();
  const { getChatContext } = useMetabotContext();

  return useCallback(async () => {
    const conversationId = uuid();
    const agentId: MetabotAgentId = `chat_${conversationId}`;
    dispatch(createAgent({ agentId, conversationId }));

    const mention = getViewingEntityMention(await getChatContext());
    if (mention) {
      // Trailing space so the cursor lands after the mention chip, ready for
      // the user to type their question.
      dispatch(
        setPrompt({
          agentId,
          prompt: `${createMetabaseProtocolLink(mention)} `,
        }),
      );
    }

    dispatch(push(`/chat/${conversationId}`));
    dispatch(focusPromptInput({ agentId }));
    return agentId;
  }, [dispatch, getChatContext]);
};
