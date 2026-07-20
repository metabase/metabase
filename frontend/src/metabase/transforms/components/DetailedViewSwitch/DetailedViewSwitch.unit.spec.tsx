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

  const { history } = renderWithProviders(
    <Route
      path="*"
      component={() => (
        <DetailedViewSwitch detailed={detailed} params={params} />
      )}
    />,
    { withRouter: true, initialRoute },
  );

  return { history };
}

describe("DetailedViewSwitch", () => {
  it("tracks a toggle to the detailed view and navigates there", async () => {
    const { history } = setup({ detailed: false });

    await userEvent.click(screen.getByLabelText("Detailed view"));

    expect(trackTransformRunsViewToggled).toHaveBeenCalledWith({
      view: "detailed",
    });
    expect(history?.getCurrentLocation().pathname).toBe(
      "/data-studio/transforms/runs/individual",
    );
  });

  it("tracks a toggle to the grouped view and navigates there", async () => {
    const { history } = setup({ detailed: true });

    await userEvent.click(screen.getByLabelText("Detailed view"));

    expect(trackTransformRunsViewToggled).toHaveBeenCalledWith({
      view: "grouped",
    });
    expect(history?.getCurrentLocation().pathname).toBe(
      "/data-studio/transforms/runs",
    );
  });
});
