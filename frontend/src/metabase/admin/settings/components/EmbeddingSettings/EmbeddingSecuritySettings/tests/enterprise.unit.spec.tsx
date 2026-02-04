import userEvent from "@testing-library/user-event";

import { findRequests } from "__support__/server-mocks";
import { fireEvent, renderWithProviders, screen, within } from "__support__/ui";

import { setup as baseSetup } from "../../tests/setup";
import { EmbeddingSecuritySettings } from "../EmbeddingSecuritySettings";

const setup = async ({
  showSdkEmbedTerms,
  isEmbeddingSdkEnabled,
}: {
  showSdkEmbedTerms?: boolean;
  isEmbeddingSdkEnabled?: boolean;
} = {}) => {
  await baseSetup({
    renderCallback: ({ state }) =>
      renderWithProviders(<EmbeddingSecuritySettings />, {
        storeInitialState: state,
      }),
    showSdkEmbedTerms,
    isEmbeddingSdkEnabled,
    tokenFeatures: {
      embedding_sdk: isEmbeddingSdkEnabled,
    },
    enterprisePlugins: isEmbeddingSdkEnabled ? ["embedding-sdk"] : [],
  });

  expect(await screen.findByText("Security")).toBeInTheDocument();
};

describe("EmbeddingSecuritySettings => enterprise", () => {
  it("should allow users to update CORS settings", async () => {
    await setup({
      isEmbeddingSdkEnabled: true,
      showSdkEmbedTerms: false,
    });

    const input = within(
      await screen.findByTestId("embedding-app-origins-sdk-setting"),
    ).getByRole("textbox");

    expect(input).toBeEnabled();
    await userEvent.clear(input);
    await userEvent.type(input, "fast.limos");
    fireEvent.blur(input);
    await screen.findByDisplayValue("fast.limos");

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    const [{ url, body }] = puts;
    expect(url).toContain("api/setting/embedding-app-origins-sdk");
    expect(body).toEqual({
      value: "fast.limos",
    });
  });
});
