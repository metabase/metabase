import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { push } from "react-router-redux";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  useListDatabaseSchemasQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import type { Database, DatabaseId } from "metabase-types/api";

import { SchemaPickerInput } from "./SchemaPickerInput";

jest.mock("metabase/api", () => ({
  ...jest.requireActual("metabase/api"),
  useListDatabasesQuery: jest.fn(),
  useListDatabaseSchemasQuery: jest.fn(),
}));

jest.mock("metabase/lib/redux", () => ({
  ...jest.requireActual("metabase/lib/redux"),
  useDispatch: jest.fn(),
}));

jest.mock("react-router-redux", () => ({
  ...jest.requireActual("react-router-redux"),
  push: jest.fn((url: string) => ({ type: "PUSH", payload: url })),
}));

jest.mock("metabase/lib/urls", () => ({
  ...jest.requireActual("metabase/lib/urls"),
  dataStudioErdBase: jest.fn(() => "/data-studio/schema-viewer"),
  dataStudioErdDatabase: jest.fn(
    (id: number) => `/data-studio/schema-viewer?database-id=${id}`,
  ),
  dataStudioErdSchema: jest.fn(
    (id: number, schema: string) =>
      `/data-studio/schema-viewer?database-id=${id}&schema=${schema}`,
  ),
}));

const mockUseListDatabasesQuery = useListDatabasesQuery as jest.Mock;
const mockUseListDatabaseSchemasQuery =
  useListDatabaseSchemasQuery as jest.Mock;
const mockUseDispatch = useDispatch as jest.Mock;
const mockPush = push as jest.Mock;

const DATABASES = [
  {
    id: 1,
    name: "Sample Database",
    engine: "postgres",
    is_saved_questions: false,
  },
  {
    id: 2,
    name: "Analytics DB",
    engine: "postgres",
    is_saved_questions: false,
  },
  {
    id: -1337,
    name: "Saved Questions",
    engine: "saved",
    is_saved_questions: true,
  },
] as Database[];

function setupSchemaMocks(
  schemasByDatabaseId: Record<number, string[]>,
  options?: { loadingIds?: number[] },
) {
  const loadingIds = new Set(options?.loadingIds ?? []);

  mockUseListDatabaseSchemasQuery.mockImplementation((arg: unknown) => {
    if (!arg || typeof arg !== "object" || !("id" in arg)) {
      return {
        data: undefined,
        isLoading: false,
      };
    }

    const id = Number((arg as { id: number }).id);

    return {
      data: schemasByDatabaseId[id],
      isLoading: loadingIds.has(id),
    };
  });
}

function renderSchemaPicker(
  props?: Partial<ComponentProps<typeof SchemaPickerInput>>,
) {
  return renderWithProviders(
    <SchemaPickerInput
      databaseId={undefined}
      schema={undefined}
      {...props}
    />,
  );
}

describe("SchemaPickerInput", () => {
  const dispatch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDispatch.mockReturnValue(dispatch);
    mockUseListDatabasesQuery.mockReturnValue({
      data: { data: DATABASES },
      isLoading: false,
    });
    setupSchemaMocks({
      1: ["PUBLIC", "ANALYTICS"],
      2: ["REPORTING"],
      [-1337]: ["metabase"],
    });
  });

  it("shows empty-state picker text when no database is selected", () => {
    renderSchemaPicker();

    expect(screen.getByText("Pick a database to view")).toBeInTheDocument();
  });

  it("shows selected database and explicit schema in button label", () => {
    renderSchemaPicker({ databaseId: 1 as DatabaseId, schema: "PUBLIC" });

    expect(screen.getByText("Sample Database / PUBLIC")).toBeInTheDocument();
  });

  it("shows auto-selected schema when current database has exactly one schema", () => {
    setupSchemaMocks({ 2: ["REPORTING"] });
    renderSchemaPicker({ databaseId: 2 as DatabaseId, schema: undefined });

    expect(screen.getByText("Analytics DB / REPORTING")).toBeInTheDocument();
  });

  it("does not show schema in label when API returns blank schema name", () => {
    setupSchemaMocks({ 2: [""] });
    renderSchemaPicker({ databaseId: 2 as DatabaseId, schema: undefined });

    expect(screen.getByText("Analytics DB")).toBeInTheDocument();
    expect(screen.queryByText("Analytics DB / ")).not.toBeInTheDocument();
  });

  it("filters out Saved Questions from database list", async () => {
    renderSchemaPicker();
    await userEvent.click(screen.getByTestId("schema-picker-button"));

    expect(
      screen.getByRole("button", { name: "Sample Database" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Saved Questions" }),
    ).not.toBeInTheDocument();
  });

  it("clears current selection when clear icon is clicked", async () => {
    renderSchemaPicker({ databaseId: 1 as DatabaseId, schema: "PUBLIC" });

    await userEvent.click(screen.getByLabelText("Clear"));

    expect(Urls.dataStudioErdBase).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/data-studio/schema-viewer");
    expect(dispatch).toHaveBeenCalledWith({
      type: "PUSH",
      payload: "/data-studio/schema-viewer",
    });
  });

  it("auto-navigates to schema URL when selected database has exactly one schema", async () => {
    setupSchemaMocks({ 1: ["PUBLIC"] });
    renderSchemaPicker();

    await userEvent.click(screen.getByTestId("schema-picker-button"));
    await userEvent.click(
      screen.getByRole("button", { name: "Sample Database" }),
    );

    await waitFor(() => {
      expect(Urls.dataStudioErdSchema).toHaveBeenCalledWith(1, "PUBLIC");
    });
    expect(mockPush).toHaveBeenCalledWith(
      "/data-studio/schema-viewer?database-id=1&schema=PUBLIC",
    );
  });

  it("auto-navigates to database URL when selected database has no schemas", async () => {
    setupSchemaMocks({ 1: [] });
    renderSchemaPicker();

    await userEvent.click(screen.getByTestId("schema-picker-button"));
    await userEvent.click(
      screen.getByRole("button", { name: "Sample Database" }),
    );

    await waitFor(() => {
      expect(Urls.dataStudioErdDatabase).toHaveBeenCalledWith(1);
    });
    expect(mockPush).toHaveBeenCalledWith(
      "/data-studio/schema-viewer?database-id=1",
    );
  });

  it("auto-navigates to database URL when selected database has blank schema name only", async () => {
    setupSchemaMocks({ 1: [""] });
    renderSchemaPicker();

    await userEvent.click(screen.getByTestId("schema-picker-button"));
    await userEvent.click(
      screen.getByRole("button", { name: "Sample Database" }),
    );

    await waitFor(() => {
      expect(Urls.dataStudioErdDatabase).toHaveBeenCalledWith(1);
    });
    expect(mockPush).toHaveBeenCalledWith(
      "/data-studio/schema-viewer?database-id=1",
    );
  });

  it("shows schema list for multi-schema database and navigates when schema is selected", async () => {
    setupSchemaMocks({ 1: ["PUBLIC", "ANALYTICS"] });
    renderSchemaPicker();

    await userEvent.click(screen.getByTestId("schema-picker-button"));
    await userEvent.click(
      screen.getByRole("button", { name: "Sample Database" }),
    );

    expect(
      screen.getByRole("button", { name: "Back to databases" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "ANALYTICS" }));

    expect(Urls.dataStudioErdSchema).toHaveBeenCalledWith(1, "ANALYTICS");
    expect(mockPush).toHaveBeenCalledWith(
      "/data-studio/schema-viewer?database-id=1&schema=ANALYTICS",
    );
  });
});
