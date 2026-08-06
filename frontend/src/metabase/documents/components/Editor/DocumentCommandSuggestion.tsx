import { forwardRef, useMemo } from "react";

import {
  useMetabotName,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import {
  CommandSuggestion,
  type CommandSuggestionProps,
  type CommandSuggestionRef,
} from "metabase/rich_text_editing/tiptap/extensions/Command/CommandSuggestion";

type DocumentCommandSuggestionProps = Omit<
  CommandSuggestionProps,
  "metabotCommand"
>;

export const DocumentCommandSuggestion = forwardRef<
  CommandSuggestionRef,
  DocumentCommandSuggestionProps
>(function DocumentCommandSuggestion(props, ref) {
  const { canUseMetabot } = useUserMetabotPermissions();
  const metabotName = useMetabotName();

  const metabotCommand = useMemo(
    () => (canUseMetabot ? { name: metabotName } : null),
    [canUseMetabot, metabotName],
  );

  return (
    <CommandSuggestion {...props} ref={ref} metabotCommand={metabotCommand} />
  );
});
