import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import type { ButtonBarProps } from "./ButtonBar";
import { ButtonBar } from "./ButtonBar";

jest.mock("../context", () => ({
  useOmniPickerContext: () => ({
    path: [{ id: 1, model: "collection", name: "Collection" }],
    isSelectableItem: () => true,
  }),
}));

jest.mock("./NewCollectionDialog", () => ({
  NewCollectionDialog: () => null,
}));

jest.mock("./NewDashboardDialog", () => ({
  NewDashboardDialog: () => null,
}));

describe("ButtonBar", () => {
  it("shows an error when Enter-triggered confirmation rejects", async () => {
    let confirmationCount = 0;
    const onConfirm: ButtonBarProps["onConfirm"] = async () => {
      confirmationCount += 1;
      throw new Error("Move failed");
    };

    renderWithProviders(
      <ButtonBar onConfirm={onConfirm} onCancel={() => {}} />,
    );

    await userEvent.keyboard("{Enter}");

    expect(await screen.findByText("Move failed")).toBeInTheDocument();
    expect(confirmationCount).toBe(1);
  });
});
