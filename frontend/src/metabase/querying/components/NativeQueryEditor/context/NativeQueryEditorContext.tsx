import { createContext, useContext } from "react";

import type { QueryModalType } from "metabase/querying/constants";
import type Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type {
  Collection,
  DatabaseId,
  NativeQuerySnippet,
  ParameterId,
} from "metabase-types/api";

/**
 * Shared state and handlers provided by the {@link NativeQueryEditor} root to
 * its composable sub-components (TopBar, Sidebar, ParametersList,
 * VisibilityToggler, RunButton). Sub-components read what they need from this
 * context instead of receiving the full set of props from every consumer.
 */
export interface NativeQueryEditorContextValue {
  question: Question;
  query: NativeQuery;
  setDatasetQuery: (query: NativeQuery) => void;

  focusEditor: () => void;
  onFormatQuery: () => void;

  readOnly?: boolean;
  isNativeEditorOpen: boolean;
  setIsNativeEditorOpen?: (
    isOpen: boolean,
    shouldOpenDataReference?: boolean,
  ) => void;
  toggleEditor: () => void;

  canChangeDatabase: boolean;
  editorContext: "question" | "action";
  databaseIsDisabled?: (database: Database) => boolean;
  databaseDisabledTooltip?: (database: Database) => string | undefined;
  onSetDatabaseId?: (id: DatabaseId) => void;
  setParameterValue?: (parameterId: ParameterId, value: string) => void;

  isRunnable: boolean;
  isRunning: boolean;
  isResultDirty: boolean;
  runQuery?: () => void;
  cancelQuery?: () => void;
  nativeEditorSelectedText?: string | null;

  snippets: NativeQuerySnippet[];
  snippetCollections: Collection[];

  isShowingDataReference: boolean;
  isShowingSnippetSidebar: boolean;
  isShowingTemplateTagsEditor: boolean;
  toggleDataReference?: () => void;
  toggleSnippetSidebar?: () => void;
  toggleTemplateTagsEditor?: () => void;
  onOpenModal?: (modalType: QueryModalType) => void;
}

const NativeQueryEditorContext =
  createContext<NativeQueryEditorContextValue | null>(null);

export const NativeQueryEditorContextProvider =
  NativeQueryEditorContext.Provider;

export function useNativeQueryEditorContext(): NativeQueryEditorContextValue {
  const context = useContext(NativeQueryEditorContext);
  if (!context) {
    throw new Error(
      "NativeQueryEditor sub-components must be rendered inside <NativeQueryEditor>",
    );
  }
  return context;
}
