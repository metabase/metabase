import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type {
  ArbitraryCustomDestinationClickBehavior,
  ClickBehavior,
} from "metabase-types/api";
import {
  createMockCard,
  createMockDashboardCard,
} from "metabase-types/api/mocks";

import { CustomURLPicker } from "./CustomURLPicker";

const CLICK_BEHAVIOR: ArbitraryCustomDestinationClickBehavior = {
  type: "link",
  linkType: "url",
  linkTemplate: "",
  linkTextTemplate: "",
};

const TABLE_DASHCARD = createMockDashboardCard({
  card: createMockCard({ display: "table" }),
});

interface CustomURLPickerWithStateProps {
  updateSettings: (settings: ClickBehavior) => void;
}

// Passes each update back as `clickBehavior`, like the click behavior sidebar
function CustomURLPickerWithState({
  updateSettings,
}: CustomURLPickerWithStateProps) {
  const [clickBehavior, setClickBehavior] =
    useState<ClickBehavior>(CLICK_BEHAVIOR);

  const handleUpdateSettings = (settings: ClickBehavior) => {
    updateSettings(settings);
    setClickBehavior(settings);
  };

  if (clickBehavior.type !== "link" || clickBehavior.linkType !== "url") {
    return null;
  }

  return (
    <CustomURLPicker
      clickBehavior={clickBehavior}
      updateSettings={handleUpdateSettings}
      dashcard={TABLE_DASHCARD}
      parameters={[]}
    />
  );
}

function setup() {
  const updateSettings = jest.fn<void, [ClickBehavior]>();

  renderWithProviders(
    <CustomURLPickerWithState updateSettings={updateSettings} />,
  );

  return { updateSettings };
}

describe("CustomURLPicker", () => {
  it("should focus the URL input when the modal opens (metabase#84843)", async () => {
    setup();

    await userEvent.keyboard("https://example.com");

    const input = screen.getByRole("textbox", { name: "URL" });
    expect(input).toHaveFocus();
    expect(input).toHaveValue("https://example.com");
  });

  it("should save the URL and close the modal on Enter (metabase#84843)", async () => {
    const { updateSettings } = setup();

    await userEvent.type(
      screen.getByRole("textbox", { name: "URL" }),
      "https://example.com{Enter}",
    );

    expect(updateSettings).toHaveBeenCalledTimes(1);
    expect(updateSettings).toHaveBeenCalledWith({
      ...CLICK_BEHAVIOR,
      linkTemplate: "https://example.com",
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("should not save an empty URL on Enter", async () => {
    const { updateSettings } = setup();

    await userEvent.type(
      screen.getByRole("textbox", { name: "URL" }),
      "{Enter}",
    );

    expect(updateSettings).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("should keep the URL when Enter is pressed in the link text input (metabase#84843)", async () => {
    const { updateSettings } = setup();

    await userEvent.type(
      screen.getByRole("textbox", { name: "URL" }),
      "https://example.com",
    );
    await userEvent.type(
      screen.getByLabelText("Customize link text (optional)"),
      "Example{Enter}",
    );

    expect(updateSettings).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(updateSettings).toHaveBeenLastCalledWith({
      ...CLICK_BEHAVIOR,
      linkTemplate: "https://example.com",
      linkTextTemplate: "Example",
    });
  });
});
