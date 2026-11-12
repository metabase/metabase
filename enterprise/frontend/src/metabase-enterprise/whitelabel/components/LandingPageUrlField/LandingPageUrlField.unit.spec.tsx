import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupSettingsEndpoints,
  setupStatefulSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { createMockSettings } from "metabase-types/api/mocks";

import { LandingPageUrlField } from "./LandingPageUrlField";

interface SetupOpts {
  landingPage?: string;
}

const setup = ({ landingPage = "" }: SetupOpts = {}) => {
  setupStatefulSettingsEndpoints(
    createMockSettings({ "landing-page": landingPage }),
  );
  setupSettingsEndpoints([]);

  renderWithProviders(
    <>
      <LandingPageUrlField />
      <UndoListing />
    </>,
  );
};

const getInput = () =>
  screen.findByLabelText("Landing page custom destination");

describe("LandingPageUrlField", () => {
  // The setting arrives after the first render, so the saved value reaches the
  // input through an effect rather than through its initial state.
  it("should show the saved landing page once the setting loads", async () => {
    setup({ landingPage: "/dashboard/1" });

    expect(await screen.findByDisplayValue("/dashboard/1")).toBeInTheDocument();
  });

  it("should save a relative URL", async () => {
    setup();

    await userEvent.type(await getInput(), "/test-1");
    await userEvent.tab();

    expect(await screen.findByText("Changes saved")).toBeInTheDocument();
    const [put] = await findRequests("PUT");
    expect(put.url).toMatch(/\/api\/setting\/landing-page$/);
    expect(put.body).toEqual({ value: "/test-1" });
  });

  it("should reject an external URL and clear the error once typing resumes", async () => {
    setup();
    const input = await getInput();
    const error = "This field must be a relative URL.";

    await userEvent.type(input, "https://google.com");
    await userEvent.tab();

    expect(await screen.findByText(error)).toBeInTheDocument();
    expect(await findRequests("PUT")).toHaveLength(0);

    await userEvent.type(input, "/fixed");

    expect(screen.queryByText(error)).not.toBeInTheDocument();
  });
});
