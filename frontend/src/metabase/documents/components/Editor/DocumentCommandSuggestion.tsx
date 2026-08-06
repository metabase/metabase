import { forwardRef, useMemo } from "react";

import { useUserMetabotPermissions } from "metabase/metabot/hooks";
import {
  CommandSuggestion,
  type CommandSuggestionProps,
  type CommandSuggestionRef,
} from "metabase/rich_text_editing/tiptap/extensions/Command/CommandSuggestion";
import { useSetting } from "metabase/settings";

type DocumentCommandSuggestionProps = Omit<
  CommandSuggestionProps,
  "metabotCommand"
>;

export const DocumentCommandSuggestion = forwardRef<
  CommandSuggestionRef,
  DocumentCommandSuggestionProps
>(function DocumentCommandSuggestion(props, ref) {
  const { canUseMetabot } = useUserMetabotPermissions();
  const metabotName = useSetting("metabot-name");

  const metabotCommand = useMemo(
    () => (canUseMetabot ? { name: metabotName } : null),
    [canUseMetabot, metabotName],
  );

  return (
    <CommandSuggestion {...props} ref={ref} metabotCommand={metabotCommand} />
  );
});
