// NOTE:
// right now the hook/plugins have code spread out throughout the file
// it's probably better to have a createhook() function that defines the behaviour
// for example the default value, the merge function, etc

import type { State } from "metabase-types/store";

// a plugin "hooks" into one or more hooks to change behaviors
export type SDKPlugin = {
  questionFooterActions?: QuestionFooterActionExtensibilityHook;
};

export type SDKContext = {
  // global context, ideally derived from redux so it can be a selector

  // temporary, we won't send all the appState like this
  appState: State;
};

const SDK_DEFAULT_PLUGIN: SDKPlugin = {
  questionFooterActions: actions => actions,
};

// just to force people to have typechecking, or defaults in the future
export const createPlugin = (
  plugins: Partial<SDKPlugin>,
): Partial<SDKPlugin> => {
  return plugins;
};

// TODO: find a better name, this just means "all the plugins merged together"
export type ComputedPlugins = Required<SDKPlugin>;

export const mergePlugins = (
  plugins: Partial<SDKPlugin>[],
): ComputedPlugins => {
  const withDefaults = [SDK_DEFAULT_PLUGIN, ...plugins];

  return {
    questionFooterActions: (
      defaultActions: QuestionFooterAction[],
      ctx?: SDKContext,
    ) =>
      withDefaults.reduce(
        (acc, plugin) =>
          plugin.questionFooterActions
            ? plugin.questionFooterActions(acc, ctx)
            : acc,
        defaultActions,
      ),
  };
};

export const COMPUTED_SDK_PLUGINS: { current: ComputedPlugins } = {
  current: mergePlugins([]),
};

type QuestionFooterAction = {
  label: string;
  icon: string;
  onClick: (question: any) => void;
};

type QuestionFooterActionExtensibilityHook = (
  actions: QuestionFooterAction[],
  ctx?: SDKContext,
) => QuestionFooterAction[];
