import { forwardRef, useMemo } from "react";

import { useUserMetabotPermissions } from "metabase/metabot/hooks";
import {
  CommandSuggestion,
  type CommandSuggestionProps,
  type CommandSuggestionRef,
} from "metabase/rich_text_editing/tiptap/extensions/Command/CommandSuggestion";
import { useSetting } from "metabase/settings";

import { CreateNativeQuestionModal } from "../editor-extensions/CardEmbed/modals/CreateNativeQuestionModal";
import { CreateStructuredQuestionModal } from "../editor-extensions/CardEmbed/modals/CreateStructuredQuestionModal";

import { useNewQuestionOptions } from "./use-new-question-options";

type DocumentCommandSuggestionProps = Omit<
  CommandSuggestionProps,
  "metabotCommand" | "newQuestionOptions" | "newQuestionModals"
>;

const NEW_QUESTION_MODALS = {
  notebook: CreateStructuredQuestionModal,
  native: CreateNativeQuestionModal,
};

export const DocumentCommandSuggestion = forwardRef<
  CommandSuggestionRef,
  DocumentCommandSuggestionProps
>(function DocumentCommandSuggestion(props, ref) {
  const { canUseMetabot } = useUserMetabotPermissions();
  const metabotName = useSetting("metabot-name");
  const newQuestionOptions = useNewQuestionOptions();

  const metabotCommand = useMemo(
    () => (canUseMetabot ? { name: metabotName } : null),
    [canUseMetabot, metabotName],
  );

  return (
    <CommandSuggestion
      {...props}
      ref={ref}
      metabotCommand={metabotCommand}
      newQuestionOptions={newQuestionOptions}
      newQuestionModals={NEW_QUESTION_MODALS}
    />
  );
});
