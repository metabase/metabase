import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";

import { EmbeddingLegaleseModal } from "./EmbeddingLegaleseModal";

const setup = () => {
  const onClose = jest.fn();

  setupPropertiesEndpoints(createMockSettings());
  setupSettingsEndpoints([]);
  setupUpdateSettingsEndpoint();

  renderWithProviders(<EmbeddingLegaleseModal opened onClose={onClose} />);

  return { onClose };
};

describe("EmbeddingLegaleseModal", () => {
  it("should enable modular embedding, dismiss the terms and close the modal when the user clicks Accept", async () => {
    const { onClose } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Agree" }), {
      delay: null,
    });

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    const [{ body }] = puts;

    expect(body).toEqual({
      "enable-embedding-modular": true,
      "show-modular-embed-terms": false,
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("should not update settings when the user clicks Decline", async () => {
    const { onClose } = setup();
    await userEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(0);
  });
});
