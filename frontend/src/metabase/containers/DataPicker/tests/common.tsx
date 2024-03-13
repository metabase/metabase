/* istanbul ignore file */
import {
  setupCollectionByIdEndpoint,
  setupCollectionVirtualSchemaEndpoints,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupSearchEndpoints,
  setupUserRecipientsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, waitForLoaderToBeRemoved } from "__support__/ui";
import Input from "metabase/core/components/Input";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockDatabase,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import DataPicker, {
  useDataPicker,
  useDataPickerValue,
} from "../../DataPicker";
import type { DataPickerFiltersProp, DataPickerValue } from "../types";

export const SAMPLE_TABLE = createMockTable({
  id: 1,
  display_name: "Table 1",
});

export const SAMPLE_TABLE_2 = createMockTable({
  id: 2,
  display_name: "Table 2",
});

export const SAMPLE_TABLE_3 = createMockTable({
  id: 3,
  db_id: 2,
  display_name: "Table 3",
});

export const SAMPLE_TABLE_4 = createMockTable({
  id: 4,
  db_id: 2,
  display_name: "Table 4",
  schema: "other",
});

export const SAMPLE_DATABASE = createMockDatabase({
  id: 1,
  name: "Sample Database",
  tables: [SAMPLE_TABLE, SAMPLE_TABLE_2],
});

export const MULTI_SCHEMA_DATABASE = createMockDatabase({
  id: 2,
  name: "Multi Schema Database",
  tables: [SAMPLE_TABLE_3, SAMPLE_TABLE_4],
});

export const EMPTY_DATABASE = createMockDatabase({
  id: 3,
  name: "Empty Database",
  tables: [],
});

export const SAMPLE_COLLECTION_ID = 1;
export const EMPTY_COLLECTION_ID = 2;

export const SAMPLE_COLLECTION = createMockCollection({
  id: SAMPLE_COLLECTION_ID,
  name: "Sample Collection",
  location: "/",
  here: ["card", "dataset"],
});

export const EMPTY_COLLECTION = createMockCollection({
  id: EMPTY_COLLECTION_ID,
  name: "Empty Collection",
  location: "/",
  here: [],
  below: ["card", "dataset"],
});

export const SAMPLE_MODEL = createMockCard({
  id: 1,
  name: "Sample Model",
  type: "model",
  collection_id: SAMPLE_COLLECTION_ID,
});

export const SAMPLE_MODEL_2 = createMockCard({
  id: 2,
  name: "Sample Model 2",
  type: "model",
  collection_id: SAMPLE_COLLECTION_ID,
});

export const SAMPLE_MODEL_3 = createMockCard({
  id: 3,
  name: "Sample Model 3",
  type: "model",
  collection_id: SAMPLE_COLLECTION_ID,
});

export const SAMPLE_QUESTION = createMockCard({
  id: 4,
  name: "Sample Saved Question",
  collection_id: SAMPLE_COLLECTION_ID,
});

export const SAMPLE_QUESTION_2 = createMockCard({
  id: 5,
  name: "Sample Saved Question 2",
  collection_id: SAMPLE_COLLECTION_ID,
});

export const SAMPLE_QUESTION_3 = createMockCard({
  id: 6,
  name: "Sample Saved Question 3",
  collection_id: SAMPLE_COLLECTION_ID,
});

export const SAMPLE_QUESTION_SEARCH_ITEM = createMockCollectionItem({
  ...SAMPLE_QUESTION,
  model: "card",
  collection: SAMPLE_COLLECTION,
});

export const SAMPLE_MODEL_SEARCH_ITEM = createMockCollectionItem({
  ...SAMPLE_MODEL,
  model: "dataset",
  collection: SAMPLE_COLLECTION,
});

function DataPickerWrapper({
  value: initialValue,
  filters,
  isMultiSelect,
  onChange,
}: {
  value: DataPickerValue;
  filters?: DataPickerFiltersProp;
  isMultiSelect?: boolean;
  onChange: (value: DataPickerValue) => void;
}) {
  const [value, setValue] = useDataPickerValue(initialValue);
  return (
    <DataPicker.Provider>
      <DataPickerSearchInput />
      <DataPicker
        value={value}
        filters={filters}
        isMultiSelect={isMultiSelect}
        onChange={(value: DataPickerValue) => {
          setValue(value);
          onChange(value);
        }}
      />
    </DataPicker.Provider>
  );
}

function DataPickerSearchInput() {
  const { search } = useDataPicker();
  const { query, setQuery } = search;

  return <Input value={query} onChange={e => setQuery(e.target.value)} />;
}

interface SetupOpts {
  initialValue?: DataPickerValue;
  filters?: DataPickerFiltersProp;
  isMultiSelect?: boolean;
  hasDataAccess?: boolean;
  hasEmptyDatabase?: boolean;
  hasMultiSchemaDatabase?: boolean;
  hasSavedQuestions?: boolean;
  hasModels?: boolean;
  hasNestedQueriesEnabled?: boolean;
}

export async function setup({
  initialValue = { tableIds: [] },
  filters,
  isMultiSelect = false,
  hasDataAccess = true,
  hasEmptyDatabase = false,
  hasMultiSchemaDatabase = false,
  hasSavedQuestions = true,
  hasModels = true,
  hasNestedQueriesEnabled = true,
}: SetupOpts = {}) {
  const onChange = jest.fn();

  if (hasDataAccess) {
    const databases = [SAMPLE_DATABASE];

    if (hasMultiSchemaDatabase) {
      databases.push(MULTI_SCHEMA_DATABASE);
    }

    if (hasEmptyDatabase) {
      databases.push(EMPTY_DATABASE);
    }

    setupDatabasesEndpoints(databases, { hasSavedQuestions });
  } else {
    setupDatabasesEndpoints([], { hasSavedQuestions: false });
  }

  const collectionList = [SAMPLE_COLLECTION, EMPTY_COLLECTION];
  setupCollectionsEndpoints({
    collections: collectionList,
  });

  setupCollectionByIdEndpoint({
    collections: collectionList,
  });

  setupCollectionVirtualSchemaEndpoints(createMockCollection(ROOT_COLLECTION), [
    SAMPLE_QUESTION,
    SAMPLE_QUESTION_2,
    SAMPLE_QUESTION_3,
    SAMPLE_MODEL,
    SAMPLE_MODEL_2,
    SAMPLE_MODEL_3,
  ]);

  setupCollectionVirtualSchemaEndpoints(SAMPLE_COLLECTION, [
    SAMPLE_QUESTION,
    SAMPLE_MODEL,
  ]);

  setupCollectionVirtualSchemaEndpoints(EMPTY_COLLECTION, []);

  if (hasModels) {
    setupSearchEndpoints([
      SAMPLE_QUESTION_SEARCH_ITEM,
      SAMPLE_MODEL_SEARCH_ITEM,
    ]);
  } else {
    setupSearchEndpoints([SAMPLE_QUESTION_SEARCH_ITEM]);
  }

  setupUserRecipientsEndpoint({ users: [createMockUser()] });

  const settings = createMockSettingsState({
    "enable-nested-queries": hasNestedQueriesEnabled,
  });

  renderWithProviders(
    <DataPickerWrapper
      value={initialValue}
      filters={filters}
      isMultiSelect={isMultiSelect}
      onChange={onChange}
    />,
    {
      storeInitialState: {
        settings,
      },
    },
  );

  await waitForLoaderToBeRemoved();

  return { onChange };
}
