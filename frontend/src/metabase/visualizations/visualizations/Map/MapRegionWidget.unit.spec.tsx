import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import { createMockUser } from "metabase-types/api/mocks";

import { MapRegionWidget } from "./MapRegionWidget";

const setup = () => {
  renderWithProviders(
    <Route
      path="*"
      element={
        <MapRegionWidget
          options={[
            { name: "United States", value: "us_states" },
            { name: "World countries", value: "world_countries" },
          ]}
          value="us_states"
          onChange={jest.fn()}
        />
      }
    />,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
      }),
      withRouter: true,
    },
  );
};

describe("MapRegionWidget", () => {
  it("should show the custom map link without opening the region select", () => {
    setup();

    expect(screen.getByDisplayValue("United States")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Custom map" })).toHaveAttribute(
      "href",
      "/admin/settings/maps",
    );
  });
});
