import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/hoc/Title";

import { MetabotPurchasePage } from "./MetabotPurchasePage";

const setup = async () => {
  renderWithProviders(
    <Route path="/admin/metabot*" component={MetabotPurchasePage} />,
    {
      withRouter: true,
      initialRoute: `/admin/metabot`,
    },
  );
};

describe("MetabotPurchasePage", () => {
  it("requires Terms of Service to be accepted", async () => {
    await setup();
    expect(
      screen.getByRole("checkbox", { name: /Terms of Service/ }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: /Add Metabot AI/ }),
    ).toBeDisabled();
    await userEvent.click(
      screen.getByRole("checkbox", { name: /Terms of Service/ }),
    );
    expect(
      screen.getByRole("checkbox", { name: /Terms of Service/ }),
    ).toBeChecked();
    expect(
      screen.getByRole("button", { name: /Add Metabot AI/ }),
    ).toBeEnabled();
  });
});
