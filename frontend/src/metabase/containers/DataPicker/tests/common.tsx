/* istanbul ignore file */
import React from "react";
import nock from "nock";

import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import {
  setupCollectionEndpoints,
  setupCollectionVirtualSchemaEndpoints,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import {
  SAMPLE_DATABASE,
  ANOTHER_DATABASE,
  MULTI_SCHEMA_DATABASE,
} from "__support__/sample_database_fixture";

import { ROOT_COLLECTION } from "metabase/entities/collections";

import type { Collection } from "metabase-types/api";

import { createMockCard, createMockCollection } from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import type Database from "metabase-lib/metadata/Database";

import type { DataPickerValue, DataPickerFiltersProp } from "../types";
import useDataPickerValue from "../useDataPickerValue";
import DataPicker from "../DataPickerContainer";

export const SAMPLE_COLLECTION = createMockCollection({
  id: 1,
  name: "Sample Collection",
  location: "/",
  here: ["card", "dataset"],
});

export const EMPTY_COLLECTION = createMockCollection({
  id: 2,
  name: "Empty Collection",
  location: "/",
  here: [],
  below: ["card", "dataset"],
});

export const SAMPLE_MODEL = createMockCard({
  id: 1,
  name: "Sample Model",
  dataset: true,
});

export const SAMPLE_MODEL_2 = createMockCard({
  id: 2,
  name: "Sample Model 2",
  dataset: true,
});

export const SAMPLE_MODEL_3 = createMockCard({
  id: 3,
  name: "Sample Model 3",
  dataset: true,
});

export const SAMPLE_QUESTION = createMockCard({
  id: 4,
  name: "Sample Saved Question",
});

export const SAMPLE_QUESTION_2 = createMockCard({
  id: 5,
  name: "Sample Saved Question 2",
});

export const SAMPLE_QUESTION_3 = createMockCard({
  id: 6,
  name: "Sample Saved Question 3",
});

function DataPickerWrapper({
  value: initialValue,
  filters,
  onChange,
}: {
  value: DataPickerValue;
  filters?: DataPickerFiltersProp;
  onChange: (value: DataPickerValue) => void;
}) {
  const [value, setValue] = useDataPickerValue(initialValue);
  return (
    <DataPicker
      value={value}
      filters={filters}
      onChange={(value: DataPickerValue) => {
        setValue(value);
        onChange(value);
      }}
    />
  );
}

interface SetupOpts {
  initialValue?: DataPickerValue;
  filters?: DataPickerFiltersProp;
  hasDataAccess?: boolean;
  hasEmptyDatabase?: boolean;
  hasMultiSchemaDatabase?: boolean;
  hasModels?: boolean;
  hasNestedQueriesEnabled?: boolean;
}

// react-virtualized's AutoSizer uses offsetWidth and offsetHeight.
// Jest runs in JSDom which doesn't support measurements APIs.
export function setupVirtualizedLists() {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    value: 100,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    value: 100,
  });

  window.HTMLElement.prototype.scrollIntoView = jest.fn();
}

export async function setup({
  initialValue = { tableIds: [] },
  filters,
  hasDataAccess = true,
  hasEmptyDatabase = false,
  hasMultiSchemaDatabase = false,
  hasModels = true,
  hasNestedQueriesEnabled = true,
}: SetupOpts = {}) {
  const onChange = jest.fn();

  const scope = nock(location.origin);

  if (hasDataAccess) {
    const databases: Database[] = [SAMPLE_DATABASE];

    if (hasMultiSchemaDatabase) {
      databases.push(MULTI_SCHEMA_DATABASE);
    }

    if (hasEmptyDatabase) {
      databases.push(ANOTHER_DATABASE);
    }

    setupDatabasesEndpoints(scope, databases);
  } else {
    scope.get("/api/database").reply(200, []);
  }

  scope
    .get("/api/search?models=dataset&limit=1")
    .reply(200, { data: hasModels ? [SAMPLE_MODEL] : [] });

  setupCollectionEndpoints(scope, [SAMPLE_COLLECTION, EMPTY_COLLECTION]);

  setupCollectionVirtualSchemaEndpoints(
    scope,
    ROOT_COLLECTION as unknown as Collection,
    [
      SAMPLE_QUESTION,
      SAMPLE_QUESTION_2,
      SAMPLE_QUESTION_3,
      SAMPLE_MODEL,
      SAMPLE_MODEL_2,
      SAMPLE_MODEL_3,
    ],
  );

  setupCollectionVirtualSchemaEndpoints(scope, SAMPLE_COLLECTION, [
    SAMPLE_QUESTION,
    SAMPLE_MODEL,
  ]);

  setupCollectionVirtualSchemaEndpoints(scope, EMPTY_COLLECTION, []);

  const settings = createMockSettingsState({
    "enable-nested-queries": hasNestedQueriesEnabled,
  });

  renderWithProviders(
    <DataPickerWrapper
      value={initialValue}
      filters={filters}
      onChange={onChange}
    />,
    {
      storeInitialState: {
        settings,
      },
      withSampleDatabase: hasDataAccess,
    },
  );

  await waitForElementToBeRemoved(() => screen.queryByText(/Loading/i));

  return { onChange };
}
