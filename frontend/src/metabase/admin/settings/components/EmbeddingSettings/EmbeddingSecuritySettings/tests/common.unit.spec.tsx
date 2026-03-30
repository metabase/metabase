import { renderWithProviders, screen } from "__support__/ui";

import { setup as baseSetup } from "../../tests/setup";
import { EmbeddingSecuritySettings } from "../EmbeddingSecuritySettings";

describe("EmbeddingSecuritySettings", () => {
  it("should show the security settings in OSS", async () => {
    await baseSetup({
      renderCallback: ({ state }) =>
        renderWithProviders(<EmbeddingSecuritySettings />, {
          storeInitialState: state,
        }),
    });

    expect(
      await screen.findByText("Cross-Origin Resource Sharing (CORS)"),
    ).toBeInTheDocument();

    expect(
      await screen.findByText("SameSite cookie setting"),
    ).toBeInTheDocument();
  });
});
