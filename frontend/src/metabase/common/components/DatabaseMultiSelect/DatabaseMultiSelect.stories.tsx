import type { Store } from "@reduxjs/toolkit";
import type { StoryFn } from "@storybook/react";
import { HttpResponse, http } from "msw";
import { useState } from "react";
import _ from "underscore";

import { getStore } from "__support__/entities-store";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { Api } from "metabase/api";
import { MetabaseReduxProvider } from "metabase/lib/redux";
import { commonReducers } from "metabase/reducers-common";
import { Stack, Text } from "metabase/ui";
import type { Database, DatabaseId } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";
import type { State } from "metabase-types/store";
import { createMockState } from "metabase-types/store/mocks";

import {
  DatabaseMultiSelect,
  type DatabaseMultiSelectProps,
} from "./DatabaseMultiSelect";

const mockDatabases: Database[] = [
  createMockDatabase({ id: 1, name: "Database 1" }),
  createMockDatabase({ id: 2, name: "Database 2" }),
  createMockDatabase({ id: 3, name: "Database 3" }),
];

const storeInitialState = createMockState({
  settings: mockSettings(),
  entities: createMockEntitiesState({}),
});

const publicReducerNames = Object.keys(commonReducers);
const initialState = _.pick(storeInitialState, ...publicReducerNames) as State;

const storeMiddleware = [Api.middleware];

const store = getStore(
  commonReducers,
  initialState,
  storeMiddleware,
) as unknown as Store<State>;

const ReduxDecorator = (Story: StoryFn) => {
  return (
    <MetabaseReduxProvider store={store}>
      <Story />
    </MetabaseReduxProvider>
  );
};

const DatabaseMultiSelectWrapper = (
  props: Omit<DatabaseMultiSelectProps, "value" | "onChange"> & {
    initialValue?: DatabaseId[];
  },
) => {
  const [value, setValue] = useState<DatabaseId[]>(props.initialValue ?? []);

  return (
    <Stack>
      <DatabaseMultiSelect {...props} value={value} onChange={setValue} />
      <Text size="sm" c="text-secondary">
        Selected IDs: {value.length > 0 ? value.join(", ") : "none"}
      </Text>
    </Stack>
  );
};

const msw = {
  handlers: [
    http.get("/api/database", () => HttpResponse.json({ data: mockDatabases })),
  ],
};

const mswEmpty = {
  handlers: [http.get("/api/database", () => HttpResponse.json({ data: [] }))],
};

export default {
  title: "Common/DatabaseMultiSelect",
  component: DatabaseMultiSelect,
  decorators: [ReduxDecorator],
  parameters: {
    msw,
  },
};

export const Default = {
  render: () => <DatabaseMultiSelectWrapper placeholder="Pick a database" />,
};

export const WithInitialSelection = {
  name: "With initial selection",
  render: () => (
    <DatabaseMultiSelectWrapper
      placeholder="Pick a database"
      initialValue={[1]}
    />
  ),
};

export const MultipleSelected = {
  name: "Multiple selected",
  render: () => (
    <DatabaseMultiSelectWrapper
      placeholder="Pick a database"
      initialValue={[1, 2]}
    />
  ),
};

export const Disabled = {
  render: () => (
    <DatabaseMultiSelectWrapper
      placeholder="Pick a database"
      initialValue={[1]}
      disabled
    />
  ),
};

export const WithLabel = {
  name: "With label",
  render: () => (
    <DatabaseMultiSelectWrapper
      placeholder="Pick a database"
      label="Select databases"
    />
  ),
};

export const WithDescription = {
  name: "With description",
  render: () => (
    <DatabaseMultiSelectWrapper
      placeholder="Pick a database"
      label="Select databases"
      description="Choose one or more databases to include"
    />
  ),
};

export const EmptyDatabases = {
  name: "Empty databases",
  parameters: {
    msw: mswEmpty,
  },
  render: () => (
    <DatabaseMultiSelectWrapper placeholder="No databases available" />
  ),
};

export const WithDisabledOptions = {
  name: "With disabled options",
  render: () => (
    <DatabaseMultiSelectWrapper
      placeholder="Pick a database"
      isOptionDisabled={(db) => db.id === 2}
      disabledOptionTooltip="Connection impersonation is not supported for this database"
    />
  ),
};
