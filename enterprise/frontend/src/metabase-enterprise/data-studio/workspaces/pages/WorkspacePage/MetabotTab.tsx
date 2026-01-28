import { PLUGIN_METABOT } from "metabase/plugins";
import type { MetabotSuggestionActions } from "metabase-enterprise/metabot/context";
import { useRegisterMetabotSuggestionActions } from "metabase-enterprise/metabot/context";
import { useRegisterMetabotTransformContext } from "metabase-enterprise/transforms/hooks/use-register-transform-metabot-context";
import type {
  DraftTransformSource,
  TaggedTransform,
  UnsavedTransform,
  WorkspaceTransform,
} from "metabase-types/api";

type AnyWorkspaceTransform =
  | TaggedTransform
  | WorkspaceTransform
  | UnsavedTransform;

type MetabotTabProps = {
  transform?: AnyWorkspaceTransform;
  source?: DraftTransformSource;
  workspaceId?: number;
  suggestionActions?: MetabotSuggestionActions;
};

const MetabotContextRegistration = ({ transform, source }: MetabotTabProps) => {
  useRegisterMetabotTransformContext(transform, source);
  return null;
};

const MetabotSuggestionActionsRegistration = ({
  suggestionActions,
}: {
  suggestionActions?: MetabotSuggestionActions;
}) => {
  useRegisterMetabotSuggestionActions(suggestionActions ?? null);
  return null;
};

export const MetabotTab = ({
  transform,
  source,
  suggestionActions,
}: MetabotTabProps) => {
  const MetabotProvider = PLUGIN_METABOT.getMetabotProvider();
  const MetabotChat = PLUGIN_METABOT.MetabotChat;

  return (
    <MetabotProvider>
      <MetabotContextRegistration transform={transform} source={source} />
      <MetabotSuggestionActionsRegistration
        suggestionActions={suggestionActions}
      />
      <MetabotChat
        config={{
          suggestionModels: ["transform", "database", "table"],
        }}
      />
    </MetabotProvider>
  );
};
