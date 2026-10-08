import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabaseEndpoints,
  setupFieldValuesEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { registerVisualizations } from "metabase/visualizations/register";
import type { Database, Field, Table } from "metabase-types/api";
import {
  createMockDatabase,
  createMockField,
  createMockFieldValues,
  createMockTable,
} from "metabase-types/api/mocks";
import {
  createOrdersQuantityField,
  createOrdersTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { FieldSection } from "./FieldSection";

registerVisualizations();

const QUANTITY_FIELD = createOrdersQuantityField();

const ORDERS_TABLE = createOrdersTable({ fields: [QUANTITY_FIELD] });

const SAMPLE_DB = createSampleDatabase({ tables: [ORDERS_TABLE] });

const JSON_FIELD = createMockField({
  id: 100,
  name: "JSON",
  display_name: "Json",
  base_type: "type/JSON",
  json_unfolding: true,
});

const JSON_TABLE = createMockTable({
  id: 100,
  db_id: 100,
  fields: [JSON_FIELD],
});

const JSON_DB = createMockDatabase({
  id: 100,
  tables: [JSON_TABLE],
  features: ["nested-field-columns"],
});

type SetupOpts = {
  field?: Field;
  table?: Table;
  database?: Database;
  fieldValues?: [number, string][];
};

function setup({
  field = QUANTITY_FIELD,
  table = ORDERS_TABLE,
  database = SAMPLE_DB,
  fieldValues = [
    [1, "1 remapped"],
    [2, "2 remapped"],
  ],
}: SetupOpts = {}) {
  const id = getRawTableFieldId(field);

  setupDatabaseEndpoints(database);
  setupFieldValuesEndpoint(
    createMockFieldValues({ field_id: id, values: fieldValues }),
  );
  fetchMock.post(
    `path:/api/field/${id}/dimension`,
    {},
    { name: `field-${id}-dimension` },
  );

  renderWithProviders(
    <>
      <FieldSection
        field={field}
        table={table}
        getFieldHref={(fieldId) => `/field/${fieldId}`}
        onFieldValuesClick={jest.fn()}
        onPreviewClick={jest.fn()}
        onTrackMetadataChange={jest.fn()}
      />
      <UndoListing />
    </>,
  );
}

/**
 * Every field setting in this section persists through PUT /api/field/:id, so
 * failing that one route exercises each handler's error branch.
 */
function failFieldUpdates(field: Field = QUANTITY_FIELD) {
  fetchMock.modifyRoute(`field-${getRawTableFieldId(field)}-put`, {
    response: { status: 500 },
  });
}

async function assertErrorToast(message: string) {
  await waitFor(() => {
    expect(
      within(screen.getByTestId("undo-list")).getByText(message),
    ).toBeInTheDocument();
  });
}

async function selectOption(input: HTMLElement, name: string) {
  await userEvent.click(input);
  const listbox = within(await screen.findByRole("listbox"));
  await userEvent.click(listbox.getByText(name));
}

describe("FieldSection", () => {
  describe("error handling", () => {
    it("shows an error toast when renaming the field fails", async () => {
      setup();
      failFieldUpdates();

      await userEvent.type(
        screen.getByPlaceholderText("Give this field a name"),
        "a",
      );
      await userEvent.tab();

      await assertErrorToast("Failed to update name of Quantity");
    });

    it("shows an error toast when updating the field description fails", async () => {
      setup();
      failFieldUpdates();

      await userEvent.type(
        screen.getByPlaceholderText("Give this field a description"),
        "a",
      );
      await userEvent.tab();

      await assertErrorToast("Failed to update description of Quantity");
    });

    it("shows an error toast when enabling casting fails", async () => {
      setup();
      failFieldUpdates();

      // the toggle opens the strategy picker itself
      await userEvent.click(
        screen.getByLabelText("Cast to a specific data type"),
      );
      const listbox = within(await screen.findByRole("listbox"));
      await userEvent.click(listbox.getByText("UNIX seconds → Datetime"));

      await assertErrorToast("Failed to enable casting for Quantity");
    });

    it("shows an error toast when updating the semantic type fails", async () => {
      setup();
      failFieldUpdates();

      await selectOption(
        screen.getByPlaceholderText("Select a semantic type"),
        "Score",
      );

      await assertErrorToast("Failed to update semantic type of Quantity");
    });

    it("shows an error toast when updating visibility fails", async () => {
      setup();
      failFieldUpdates();

      await selectOption(
        screen.getByPlaceholderText("Select a field visibility"),
        "Only in detail views",
      );

      await assertErrorToast("Failed to update visibility of Quantity");
    });

    it("shows an error toast when updating filtering fails", async () => {
      setup();
      failFieldUpdates();

      await selectOption(
        screen.getByPlaceholderText("Select field filtering"),
        "Search box",
      );

      await assertErrorToast("Failed to update filtering of Quantity");
    });

    it("shows an error toast when updating display values fails", async () => {
      setup();
      fetchMock.modifyRoute(`field-${QUANTITY_FIELD.id}-dimension`, {
        response: { status: 500 },
      });

      // RemappingPicker renders only once the database query resolves
      await selectOption(
        await screen.findByPlaceholderText("Select display values"),
        "Custom mapping",
      );

      await assertErrorToast("Failed to update display values of Quantity");
    });

    it("shows an error toast when disabling JSON unfolding fails", async () => {
      setup({ field: JSON_FIELD, table: JSON_TABLE, database: JSON_DB });
      failFieldUpdates(JSON_FIELD);

      await selectOption(
        await screen.findByPlaceholderText("Select whether to unfold JSON"),
        "No",
      );

      await assertErrorToast("Failed to disable JSON unfolding for Json");
    });

    it("shows an error toast when updating formatting fails", async () => {
      setup();
      failFieldUpdates();

      await userEvent.type(screen.getByTestId("prefix"), "5");
      await userEvent.tab();

      await assertErrorToast("Failed to update formatting of Quantity");
    });
  });
});
