import type { MetabaseAuthConfig } from "embedding-sdk/types";
import type { MetabaseTheme } from "embedding-sdk/types/theme";

export { StaticQuestion, type StaticQuestionProps } from "./StaticQuestion";
export {
  InteractiveQuestion,
  type InteractiveQuestionProps,
} from "./InteractiveQuestion";
export {
  MetabaseProvider,
  type MetabaseProviderProps,
} from "./MetabaseProvider";
export { StaticDashboard, type StaticDashboardProps } from "./StaticDashboard";
export {
  CollectionBrowser,
  type CollectionBrowserProps,
} from "./CollectionBrowser";
export {
  InteractiveDashboard,
  EditableDashboard,
  type InteractiveDashboardProps,
  type EditableDashboardProps,
} from "./InteractiveDashboard";
export { ModifyQuestion } from "./ModifyQuestion";
export { CreateQuestion, type CreateQuestionProps } from "./CreateQuestion";
export {
  CreateDashboardModal,
  useCreateDashboardApi,
  type CreateDashboardModalProps,
  type CreateDashboardValues,
} from "./CreateDashboardModal";
export { FlexibleSizeComponent } from "./FlexibleSizeComponent";
export type { FlexibleSizeProps } from "./FlexibleSizeComponent";

// These functions looks useless but it's a trick to have a way to type the config
// while having code snippets the same across js and ts. This works because the
// type is only in the function declaration and not where the config is
// declared. `const authConfig = defineMetabaseAuthConfig({})` will have the type of
// `MetabaseAuthConfig` and even provide autocompletion for js users depending on their
// IDE configuration.

export const defineMetabaseAuthConfig = (
  config: MetabaseAuthConfig,
): MetabaseAuthConfig => config;

export const defineMetabaseTheme = (theme: MetabaseTheme): MetabaseTheme =>
  theme;
