import userEvent from "@testing-library/user-event";

import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { getEntityLookups } from "metabase/querying/common/components/DataSelector";
import { checkNotNull } from "metabase/utils/types";
import type { Database } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import { DataSelectorDatabasePicker } from "./DataSelectorDatabasePicker";

const TEST_DATABASE = createMockDatabase();
const SAMPLE_DATABASE = createMockDatabase({ id: 1, name: "Sample Database" });
const WAREHOUSE_DATABASE = createMockDatabase({ id: 2, name: "Warehouse" });

interface SetupOpts {
  databases?: Database[];
  onBack?: () => void;
}

const setup = ({ databases = [TEST_DATABASE], onBack }: SetupOpts = {}) => {
  const state = createMockState({
    entities: createMockEntitiesState({ databases }),
  });
  const lookups = getEntityLookups(state);
  const onChangeDatabase = jest.fn();

  renderWithProviders(
    <DataSelectorDatabasePicker
      databases={databases.map((database) =>
        checkNotNull(lookups.database(database.id)),
      )}
      onBack={onBack}
      onChangeDatabase={onChangeDatabase}
    />,
  );

  return { onChangeDatabase };
};

describe("DataSelectorDatabasePicker", () => {
  it("displays database name", () => {
    setup();
    expect(screen.getByText(TEST_DATABASE.name)).toBeInTheDocument();
  });

  it("lists Sample Database and Warehouse under the Raw Data back link", () => {
    setup({
      databases: [SAMPLE_DATABASE, WAREHOUSE_DATABASE],
      onBack: jest.fn(),
    });

    const backLink = screen.getByText("Raw Data");
    const sampleDatabase = screen.getByText("Sample Database");
    const warehouse = screen.getByText("Warehouse");
    expect(
      backLink.compareDocumentPosition(sampleDatabase) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      sampleDatabase.compareDocumentPosition(warehouse) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("goes back once without picking a database when Raw Data is clicked", async () => {
    const onBack = jest.fn();
    const { onChangeDatabase } = setup({
      databases: [SAMPLE_DATABASE, WAREHOUSE_DATABASE],
      onBack,
    });

    await userEvent.click(screen.getByText("Raw Data"));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onChangeDatabase).not.toHaveBeenCalled();
    expect(screen.getByText("Sample Database")).toBeInTheDocument();
  });
});
