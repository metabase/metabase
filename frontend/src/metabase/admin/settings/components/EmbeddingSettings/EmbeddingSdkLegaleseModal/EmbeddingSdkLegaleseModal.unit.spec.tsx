import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";

import { EmbeddingSdkLegaleseModal } from "./EmbeddingSdkLegaleseModal";

const MOCK_TIMEOUT = 100;

const setup = () => {
  const onClose = jest.fn();
  const updateSetting = jest
    .fn()
    .mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, MOCK_TIMEOUT)),
    );
  renderWithProviders(
    <EmbeddingSdkLegaleseModal
      opened
      onClose={onClose}
      updateSetting={updateSetting}
    />,
  );
  return {
    onClose,
    updateSetting,
  };
};

describe("EmbeddingSdkLegaleseModal", () => {
  it("should update the settings and close the modal when the user clicks Accept", async () => {
    const { updateSetting, onClose } = setup();

    await userEvent.click(screen.getByText("Agree and continue"), {
      delay: null,
    });

    expect(
      screen.getByRole("button", { name: "Agree and continue" }),
    ).toHaveAttribute("data-is-loading", "true");

    await waitFor(() => {
      expect(updateSetting).toHaveBeenCalledTimes(2);
    });

    expect(updateSetting).toHaveBeenNthCalledWith(
      1,
      { key: "show-sdk-embed-terms" },
      false,
    );
    expect(updateSetting).toHaveBeenNthCalledWith(
      2,
      { key: "enable-embedding-sdk" },
      true,
    );

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("should not update settings when the user clicks Decline", async () => {
    const { updateSetting, onClose } = setup();
    await userEvent.click(screen.getByText("Decline and go back"));
    expect(updateSetting).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
