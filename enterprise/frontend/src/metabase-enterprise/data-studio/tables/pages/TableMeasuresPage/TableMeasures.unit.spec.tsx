import { Route } from "react-router";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { EnterpriseSettings } from "metabase-types/api";
import { createMockTable } from "metabase-types/api/mocks";

import { TableMeasures } from "./TableMeasures";

type SetupOpts = {
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
};

const setup = ({ remoteSyncType }: SetupOpts = {}) => {
  const mockTable = createMockTable({
    id: 1,
    db_id: 1,
    schema: "PUBLIC",
  });

  renderWithProviders(
    <Route path="/" component={() => <TableMeasures table={mockTable} />} />,
    {
      withRouter: true,
      storeInitialState: {
        settings: mockSettings({
          "remote-sync-type": remoteSyncType,
          "remote-sync-enabled": !!remoteSyncType,
        }),
      },
    },
  );
};

describe("TablesMeasures", () => {
  it("renders the new measure button", () => {
    setup();
    expect(
      screen.getByRole("link", { name: /New measure/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /New measure/ })).toHaveAttribute(
      "href",
      "/data-studio/library/tables/1/measures/new",
    );
  });

  it("does not render the new measure button if remote sync is set to read-only", () => {
    setup({ remoteSyncType: "read-only" });
    expect(
      screen.queryByRole("link", { name: /New measure/ }),
    ).not.toBeInTheDocument();
  });
});
