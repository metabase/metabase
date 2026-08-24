import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";

import { trackTransformRunsViewToggled } from "../../analytics";

import { DetailedViewSwitch } from "./DetailedViewSwitch";

jest.mock("../../analytics", () => ({
  ...jest.requireActual("../../analytics"),
  trackTransformRunsViewToggled: jest.fn(),
}));

type SetupOpts = {
  detailed: boolean;
  params?: Urls.CommonRunListParams;
};

function setup({ detailed, params = {} }: SetupOpts) {
  const initialRoute = detailed
    ? Urls.transformRunList()
    : Urls.transformGraphRunList();

  const { router } = renderWithProviders(
    <Route
      path="*"
      element={<DetailedViewSwitch detailed={detailed} params={params} />}
    />,
    { withRouter: true, initialRoute },
  );

  return { router };
}

describe("DetailedViewSwitch", () => {
  it("tracks a toggle to the detailed view and navigates there", async () => {
    const { router } = setup({ detailed: false });

    await userEvent.click(screen.getByLabelText("Detailed view"));

    expect(trackTransformRunsViewToggled).toHaveBeenCalledWith({
      view: "detailed",
    });
    expect(router?.location.pathname).toBe(
      "/data-studio/transforms/runs/individual",
    );
  });

  it("tracks a toggle to the grouped view and navigates there", async () => {
    const { router } = setup({ detailed: true });

    await userEvent.click(screen.getByLabelText("Detailed view"));

    expect(trackTransformRunsViewToggled).toHaveBeenCalledWith({
      view: "grouped",
    });
    expect(router?.location.pathname).toBe("/data-studio/transforms/runs");
  });
});
