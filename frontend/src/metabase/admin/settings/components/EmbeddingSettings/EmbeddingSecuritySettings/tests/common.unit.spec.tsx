import userEvent from "@testing-library/user-event";

import { findRequests } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";

import { setup as baseSetup } from "../../tests/setup";
import { EmbeddingSecurityWidgets } from "../EmbeddingSecuritySettings";

const setup = async () => {
  await baseSetup({
    // SameSite is paid-only now: it is inert for guest embeds.
    tokenFeatures: { embedding_simple: true },
    renderCallback: ({ state }) =>
      renderWithProviders(<EmbeddingSecurityWidgets />, {
        storeInitialState: state,
      }),
  });

  expect(
    await screen.findByText("Cross-Origin Resource Sharing (CORS)"),
  ).toBeInTheDocument();
};

describe("EmbeddingSecuritySettings => common", () => {
  it("should allow users to update CORS settings", async () => {
    await setup();

    expect(
      await screen.findByText("Cross-Origin Resource Sharing (CORS)"),
    ).toBeInTheDocument();

    const input = await screen.findByPlaceholderText("https://*.example.com");
    await userEvent.type(input, "https://my-app.example.com");
    await userEvent.tab();

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);

    const [{ url, body }] = puts;
    expect(url).toContain("/setting/embedding-app-origins-sdk");
    expect(body).toEqual({ value: "https://my-app.example.com" });
  });

  it("should allow changing samesite cookie setting", async () => {
    await setup();

    expect(
      await screen.findByText("SameSite cookie setting"),
    ).toBeInTheDocument();

    const button = await screen.findByText("Lax (default)");
    await userEvent.click(button);
    const newOption = await screen.findByText("Strict (not recommended)");
    await userEvent.click(newOption);

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);

    const [{ url, body }] = puts;
    expect(url).toContain("/setting/session-cookie-samesite");
    expect(body).toEqual({ value: "strict" });
  });
});
