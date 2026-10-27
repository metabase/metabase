import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupSettingsEndpoints,
  setupStatefulSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";

import { LandingPageUrlField } from "./LandingPageUrlField";

const setup = async ({ landingPage = "" }: { landingPage?: string } = {}) => {
  setupStatefulSettingsEndpoints({ "landing-page": landingPage });
  setupSettingsEndpoints([]);

  renderWithProviders(
    <>
      <LandingPageUrlField />
      <UndoListing />
    </>,
  );

  const input = await screen.findByLabelText("Landing page custom destination");
  // The saved value only reaches the input once the settings request resolves,
  // and it overwrites whatever the test typed before that.
  await waitFor(() => expect(input).toHaveValue(landingPage));
  return input;
};

describe("LandingPageUrlField", () => {
  it("should save a relative url", async () => {
    const input = await setup();

    await userEvent.type(input, "/test-1");
    await userEvent.tab();

    await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
    });
    const [{ url, body }] = await findRequests("PUT");
    expect(url).toMatch(/landing-page/);
    expect(body).toEqual({ value: "/test-1" });

    expect(await screen.findByText("Changes saved")).toBeInTheDocument();
  });

  it("should reject an external url and keep the saved value", async () => {
    const input = await setup({ landingPage: "/test-1" });

    await userEvent.clear(input);
    await userEvent.type(input, "https://google.com");
    await userEvent.tab();

    expect(
      await screen.findByText("This field must be a relative URL."),
    ).toBeInTheDocument();

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(0);
  });
});
