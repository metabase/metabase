import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen } from "__support__/ui";
import * as domUtils from "metabase/utils/dom";

import {
  setup,
  waitForLoadingToFinish,
} from "./TransformsUpsellPage.setup.spec";

describe("TransformsUpsellPage", () => {
  beforeEach(() => {
    fetchMock.post("path:/api/ee/cloud-add-ons/transforms-basic-metered", 200);
    jest.spyOn(domUtils, "reload").mockImplementation(() => undefined);
  });

  it("does not render an enable button if the user is not a store user", async () => {
    setup({ isHosted: true, isStoreUser: false });
    await waitForLoadingToFinish();

    expect(
      screen.queryByRole("button", { name: "Enable transforms" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/contact a store administrator/i),
    ).toBeInTheDocument();
  });

  it("proceeds to an agree step with an overview of the free bucket", async () => {
    setup({ isHosted: true, isStoreUser: true });
    await waitForLoadingToFinish();

    expect(
      screen.getByText("Customize and clean up your data"),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Enable transforms" }),
    );

    expect(screen.getByText("1,000 free transform runs")).toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls(
        "path:/api/ee/cloud-add-ons/transforms-basic-metered",
        { method: "POST" },
      ),
    ).toHaveLength(0);

    await userEvent.click(
      screen.getByRole("button", { name: "Agree and continue" }),
    );

    expect(
      screen.getByText("Setting up transforms, please wait"),
    ).toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls(
        "path:/api/ee/cloud-add-ons/transforms-basic-metered",
        { method: "POST" },
      ),
    ).toHaveLength(1);
  });

  it("skips the free bucket overview if the user has had transforms before", async () => {
    setup({ isHosted: true, isStoreUser: true, hadTransforms: true });
    await waitForLoadingToFinish();

    expect(
      screen.queryByText("1,000 free transform runs"),
    ).not.toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls(
        "path:/api/ee/cloud-add-ons/transforms-basic-metered",
        { method: "POST" },
      ),
    ).toHaveLength(0);

    await userEvent.click(
      screen.getByRole("button", { name: "Enable transforms" }),
    );

    expect(
      screen.getByText("Setting up transforms, please wait"),
    ).toBeInTheDocument();

    expect(
      fetchMock.callHistory.calls(
        "path:/api/ee/cloud-add-ons/transforms-basic-metered",
        { method: "POST" },
      ),
    ).toHaveLength(1);
  });
});
