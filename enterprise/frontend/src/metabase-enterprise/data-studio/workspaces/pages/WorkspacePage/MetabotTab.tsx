import { MetabotChat } from "metabase/metabot/components/MetabotChat";
import type { MetabotSuggestionActions } from "metabase/metabot/context";
import {
  MetabotProvider,
  useRegisterMetabotSuggestionActions,
} from "metabase/metabot/context";
import { useRegisterMetabotTransformContext } from "metabase/transforms/hooks/use-register-transform-metabot-context";
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
