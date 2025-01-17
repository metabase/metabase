import type { MetabaseAuthConfig } from "embedding-sdk/types";
import { defineMetabaseTheme } from "metabase/embedding-sdk/theme";

export {
  CollectionBrowser,
  type CollectionBrowserProps,
} from "./CollectionBrowser";
export {
  CreateDashboardModal,
  useCreateDashboardApi,
  type CreateDashboardModalProps,
  type CreateDashboardValues,
} from "./CreateDashboardModal";
export { CreateQuestion, type CreateQuestionProps } from "./CreateQuestion";
export { FlexibleSizeComponent } from "./FlexibleSizeComponent";
export type { FlexibleSizeProps } from "./FlexibleSizeComponent";
export {
  EditableDashboard,
  InteractiveDashboard,
  type EditableDashboardProps,
  type InteractiveDashboardProps,
} from "./InteractiveDashboard";
export {
  InteractiveQuestion,
  type InteractiveQuestionProps,
} from "./InteractiveQuestion";
export {
  MetabaseProvider,
  type MetabaseProviderProps,
} from "./MetabaseProvider";
export { ModifyQuestion } from "./ModifyQuestion";
export { StaticDashboard, type StaticDashboardProps } from "./StaticDashboard";
export { StaticQuestion, type StaticQuestionProps } from "./StaticQuestion";

// These functions looks useless but it's a trick to have a way to type the config
// while having code snippets the same across js and ts. This works because the
// type is only in the function declaration and not where the config is
// declared. `const authConfig = defineMetabaseAuthConfig({})` will have the type of
// `MetabaseAuthConfig` and even provide autocompletion for js users depending on their
// IDE configuration.

export const defineMetabaseAuthConfig = (
  config: MetabaseAuthConfig,
): MetabaseAuthConfig => config;

export { defineMetabaseTheme };
