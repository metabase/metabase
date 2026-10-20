import { renderWithProviders, screen } from "__support__/ui";

import { SyncOptionsModal } from "./SyncOptionsModal";

type SetupOpts = {
  readOnly?: boolean;
};

function setup({ readOnly }: SetupOpts = {}) {
  renderWithProviders(
    <SyncOptionsModal
      isOpen
      tableId={1}
      readOnly={readOnly}
      onClose={jest.fn()}
    />,
  );
}

describe("SyncOptionsModal", () => {
  it("offers to re-sync the schema and scan field values", () => {
    setup();

    expect(screen.getByText("Re-sync schema")).toBeInTheDocument();
    expect(screen.getByText("Scan field values")).toBeInTheDocument();
  });

  it("only offers to re-sync the schema of a read-only table", () => {
    setup({ readOnly: true });

    expect(screen.getByText("Re-sync schema")).toBeInTheDocument();
    expect(screen.queryByText("Scan field values")).not.toBeInTheDocument();
  });
});
