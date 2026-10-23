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

const setup = () => {
  setupStatefulSettingsEndpoints(createMockSettings({ "landing-page": "" }));
  setupSettingsEndpoints([]);

  renderWithProviders(
    <>
      <LandingPageUrlField />
      <UndoListing />
    </>,
  );
};

describe("LandingPageUrlField", () => {
  it("should save a relative URL and reject an external one", async () => {
    setup();
    const input = await screen.findByLabelText(
      "Landing page custom destination",
    );

    await userEvent.type(input, "/test-1");
    await userEvent.tab();

    expect(await screen.findByText("Changes saved")).toBeInTheDocument();
    const [put] = await findRequests("PUT");
    expect(put.url).toContain("/api/setting/landing-page");
    expect(put.body).toEqual({ value: "/test-1" });

    await userEvent.clear(input);
    await userEvent.type(input, "https://google.com");
    await userEvent.tab();

    expect(
      await screen.findByText("This field must be a relative URL."),
    ).toBeInTheDocument();
    expect(await findRequests("PUT")).toHaveLength(1);
  });
});
