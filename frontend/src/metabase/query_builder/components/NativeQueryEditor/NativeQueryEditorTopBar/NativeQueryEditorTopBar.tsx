import type { QueryModalType } from "metabase/query_builder/constants";
import { Flex } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type {
  Collection,
  DatabaseId,
  NativeQuerySnippet,
  ParameterId,
  TableId,
} from "metabase-types/api";

import { ResponsiveParametersList } from "../../ResponsiveParametersList";
import DataSourceSelectors from "../DataSourceSelectors/DataSourceSelectors";
import type { Features as SidebarFeatures } from "../NativeQueryEditorActionButtons";
import { NativeQueryEditorActionButtons } from "../NativeQueryEditorActionButtons/NativeQueryEditorActionButtons";
import { VisibilityToggler } from "../VisibilityToggler/VisibilityToggler";
import { formatQuery } from "../utils";

interface NativeQueryEditorTopBarProps {
  question: Question;
  query: NativeQuery;

  isRunnable: boolean;
  isRunning: boolean;
  isResultDirty: boolean;
  isShowingSnippetSidebar: boolean;
  isShowingDataReference: boolean;
  isShowingTemplateTagsEditor: boolean;
  isNativeEditorOpen: boolean;
  nativeEditorSelectedText?: string;
  canChangeDatabase: boolean;
  hasParametersList?: boolean;
  hasEditingSidebar: boolean;
  readOnly?: boolean;

  snippets?: NativeQuerySnippet[];
  editorContext?: "question";
  snippetCollections?: Collection[];
  sidebarFeatures: SidebarFeatures;

  toggleDataReference: () => void;
  toggleTemplateTagsEditor: () => void;
  toggleEditor: () => void;
  toggleSnippetSidebar: () => void;
  setIsNativeEditorOpen?: (isOpen: boolean) => void;
  onSetDatabaseId?: (id: DatabaseId) => void;
  onOpenModal: (modalType: QueryModalType) => void;
  onChange: (queryText: string) => void;
  setParameterValueToDefault: (parameterId: ParameterId) => void;
  setParameterValue: (parameterId: ParameterId, value: string) => void;
  focus: () => void;
  setDatasetQuery: (query: NativeQuery) => Promise<Question>;
}

const NativeQueryEditorTopBar = (props: NativeQueryEditorTopBarProps) => {
  const {
    query,
    question,
    onChange,
    canChangeDatabase,
    isNativeEditorOpen,
    readOnly,
    editorContext = "question",
    setParameterValue,
    sidebarFeatures,
    hasEditingSidebar,
    snippetCollections,
    focus: setFocus,
    snippets,
    isRunnable,
    isRunning,
    isResultDirty,
    isShowingDataReference,
    isShowingTemplateTagsEditor,
    isShowingSnippetSidebar,
    onOpenModal,
    toggleDataReference,
    toggleTemplateTagsEditor,
    toggleSnippetSidebar,
    nativeEditorSelectedText,
    setIsNativeEditorOpen,
    toggleEditor,
    onSetDatabaseId,
    hasParametersList = true,
    setParameterValueToDefault,
    setDatasetQuery,
  } = props;

  const setTableId = (tableId: TableId) => {
    const table = query.metadata().table(tableId);
    if (table && table.name !== query.collection()) {
      setDatasetQuery(query.setCollectionName(table.name));
    }
  };

  const setParameterIndex = (
    parameterId: ParameterId,
    parameterIndex: number,
  ) => {
    // could be
    // dispatch(updateQuestion(question.setDatasetQuery(datasetQuery)));
    setDatasetQuery(query.setParameterIndex(parameterId, parameterIndex));
  };

  // Change the Database we're currently editing a query for.
  const setDatabaseId = (databaseId: DatabaseId) => {
    if (question.databaseId() !== databaseId) {
      setDatasetQuery(query.setDatabaseId(databaseId).setDefaultCollection());

      onSetDatabaseId?.(databaseId);
      setFocus();
    }
  };

  const handleFormatQuery = async () => {
    const query = question.query();
    const engine = Lib.engine(query);
    const queryText = Lib.rawNativeQuery(query);

    if (!engine) {
      // no engine found, do nothing
      return;
    }

    const formattedQuery = await formatQuery(queryText, engine);
    onChange(formattedQuery);
    setFocus();
  };

  if (!question) {
    return null;
  }

  const parameters = question.parameters();

  return (
    <Flex align="flex-start" data-testid="native-query-top-bar">
      {canChangeDatabase && (
        <DataSourceSelectors
          isNativeEditorOpen={isNativeEditorOpen}
          query={query}
          question={question}
          readOnly={readOnly}
          setDatabaseId={setDatabaseId}
          setTableId={setTableId}
          editorContext={editorContext}
        />
      )}
      {hasParametersList && (
        <ResponsiveParametersList
          question={question}
          parameters={parameters}
          setParameterValue={setParameterValue}
          setParameterIndex={setParameterIndex}
          setParameterValueToDefault={setParameterValueToDefault}
          enableParameterRequiredBehavior
        />
      )}
      <Flex ml="auto" gap="lg" mr="lg" align="center" h="55px">
        {isNativeEditorOpen && hasEditingSidebar && !readOnly && (
          <NativeQueryEditorActionButtons
            features={sidebarFeatures}
            onFormatQuery={handleFormatQuery}
            onGenerateQuery={onChange}
            question={question}
            nativeEditorSelectedText={nativeEditorSelectedText}
            snippetCollections={snippetCollections}
            snippets={snippets}
            isRunnable={isRunnable}
            isRunning={isRunning}
            isResultDirty={isResultDirty}
            isShowingDataReference={isShowingDataReference}
            isShowingTemplateTagsEditor={isShowingTemplateTagsEditor}
            isShowingSnippetSidebar={isShowingSnippetSidebar}
            onOpenModal={onOpenModal}
            toggleDataReference={toggleDataReference}
            toggleTemplateTagsEditor={toggleTemplateTagsEditor}
            toggleSnippetSidebar={toggleSnippetSidebar}
          />
        )}
        {query.hasWritePermission() &&
          !question.isArchived() &&
          setIsNativeEditorOpen && (
            <VisibilityToggler
              isOpen={isNativeEditorOpen}
              readOnly={!!readOnly}
              toggleEditor={toggleEditor}
            />
          )}
      </Flex>
    </Flex>
  );
};

export { NativeQueryEditorTopBar };
