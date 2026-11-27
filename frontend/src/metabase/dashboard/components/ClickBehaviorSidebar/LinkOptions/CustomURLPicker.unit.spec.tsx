import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type {
  ArbitraryCustomDestinationClickBehavior,
  ClickBehavior,
} from "metabase-types/api";
import {
  createMockCard,
  createMockDashboardCard,
} from "metabase-types/api/mocks";

import { CustomURLPicker } from "./CustomURLPicker";

function setup() {
  const updateSettings = jest.fn<void, [ClickBehavior]>();
  const clickBehavior: ArbitraryCustomDestinationClickBehavior = {
    type: "link",
    linkType: "url",
    linkTemplate: "",
  };

  renderWithProviders(
    <CustomURLPicker
      dashcard={createMockDashboardCard({
        card: createMockCard({ display: "line" }),
      })}
      clickBehavior={clickBehavior}
      parameters={[]}
      updateSettings={updateSettings}
    />,
  );

  return { updateSettings };
}

describe("CustomURLPicker", () => {
  it("focuses URL input when modal opens", async () => {
    setup();

    expect(
      await screen.findByPlaceholderText(/e\.g\. http:\/\/acme\.com/),
    ).toHaveFocus();
  });

  it("submits URL when pressing Enter in URL input", async () => {
    const { updateSettings } = setup();

    await userEvent.type(
      await screen.findByPlaceholderText(/e\.g\. http:\/\/acme\.com/),
      "https://example.com{Enter}",
    );

    expect(updateSettings).toHaveBeenCalledTimes(1);
    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ linkTemplate: "https://example.com" }),
    );
  });

  it("does not submit empty URL when pressing Enter", async () => {
    const { updateSettings } = setup();

    await userEvent.type(
      await screen.findByPlaceholderText(/e\.g\. http:\/\/acme\.com/),
      "{Enter}",
    );

    expect(updateSettings).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
