import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";

import { EmbeddingSdkLegaleseModal } from "./EmbeddingSdkLegaleseModal";

const setup = () => {
  const onClose = jest.fn();
  setupPropertiesEndpoints(createMockSettings());
  setupSettingsEndpoints([]);
  setupUpdateSettingsEndpoint();

  renderWithProviders(<EmbeddingSdkLegaleseModal opened onClose={onClose} />);

  return { onClose };
};

describe("EmbeddingSdkLegaleseModal", () => {
  it("should update the settings and close the modal when the user clicks Accept", async () => {
    const { onClose } = setup();

    await userEvent.click(screen.getByText("Agree and continue"), {
      delay: null,
    });

    expect(
      screen.getByRole("button", { name: "Agree and continue" }),
    ).toHaveAttribute("data-is-loading", "true");

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    const [{ body }] = puts;

    expect(body).toEqual({
      "show-sdk-embed-terms": false,
      "enable-embedding-sdk": true,
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("should not update settings when the user clicks Decline", async () => {
    const { onClose } = setup();
    await userEvent.click(screen.getByText("Decline and go back"));
    expect(onClose).toHaveBeenCalled();
    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(0);
  });
});
