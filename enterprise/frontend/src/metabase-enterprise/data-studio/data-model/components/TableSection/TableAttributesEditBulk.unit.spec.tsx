import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useEffect, useState } from "react";
import _ from "underscore";

import {
  setupTableEndpoints,
  setupUserKeyValueEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  SelectionProvider,
  useSelection,
} from "metabase-enterprise/data-studio/data-model/pages/DataModel/contexts/SelectionContext";
import type { TableId } from "metabase-types/api";
import { createMockTable, createMockUser } from "metabase-types/api/mocks";

import { TableAttributesEditBulk } from "./TableAttributesEditBulk";

// Component that allows controlling selection for testing
function SelectionController({
  initialTables,
  onSelectionChange,
}: {
  initialTables: Set<TableId>;
  onSelectionChange: () => void;
}) {
  const { setSelectedTables } = useSelection();

  useEffect(() => {
    // Set initial selection
    setSelectedTables(initialTables);
  }, [initialTables, setSelectedTables]);

  return (
    <button
      data-testid="change-selection"
      onClick={() => {
        // Change selection to a different table
        setSelectedTables(new Set([999]));
        onSelectionChange();
      }}
    >
      Change Selection
    </button>
  );
}

function TestWrapper({
  initialTables = new Set([1]),
}: {
  initialTables?: Set<TableId>;
}) {
  const [_selectionChanged, setSelectionChanged] = useState(false);

  return (
    <SelectionProvider>
      <TableAttributesEditBulk hasLibrary canPublish onUpdate={_.noop} />
      <SelectionController
        initialTables={initialTables}
        onSelectionChange={() => setSelectionChanged(true)}
      />
    </SelectionProvider>
  );
}

type SetupOpts = {
  initialTables?: Set<TableId>;
  isAdmin?: boolean;
  isDataAnalyst?: boolean;
};

function setup({
  initialTables = new Set([1]),
  isAdmin = false,
  isDataAnalyst = false,
}: SetupOpts = {}) {
  setupUsersEndpoints([createMockUser()]);
  setupUserKeyValueEndpoints({
    namespace: "user_acknowledgement",
    key: "seen-publish-tables-info",
    value: true,
  });
  setupTableEndpoints(createMockTable());

  fetchMock.post("path:/api/ee/data-studio/table/edit", {
    status: 200,
    body: {
      data: {
        id: 1,
      },
    },
  });

  renderWithProviders(<TestWrapper initialTables={initialTables} />, {
    withRouter: false,
    storeInitialState: {
      currentUser: createMockUser({
        is_superuser: isAdmin,
        is_data_analyst: isDataAnalyst,
      }),
    },
  });
}

describe("TableAttributesEditBulk", () => {
  it("should render publish buttons for admins", async () => {
    setup({ isAdmin: true });

    await waitFor(() => {
      expect(screen.getByText(/tables selected/i)).toBeInTheDocument();
    });

    expect(screen.getByText("Publish")).toBeInTheDocument();
    expect(screen.getByText("Unpublish")).toBeInTheDocument();
  });

  it("should render publish buttons for data analysts", async () => {
    setup({ isDataAnalyst: true });

    await waitFor(() => {
      expect(screen.getByText(/tables selected/i)).toBeInTheDocument();
    });

    expect(screen.getByText("Publish")).toBeInTheDocument();
    expect(screen.getByText("Unpublish")).toBeInTheDocument();
  });

  it("should reset form state when selection changes", async () => {
    setup({ initialTables: new Set([1]) });
    const userName = "Testy Tableton";

    await waitFor(() => {
      expect(screen.getByText(/tables selected/i)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("textbox", { name: "Owner" }));
    await userEvent.click(screen.getByText(userName));
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Owner" })).toHaveValue(
        userName,
      );
    });

    const changeSelectionButton = screen.getByTestId("change-selection");
    await userEvent.click(changeSelectionButton);

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Owner" })).toHaveValue("");
    });
  });
});
