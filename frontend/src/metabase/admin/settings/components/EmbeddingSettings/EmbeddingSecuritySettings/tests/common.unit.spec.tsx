import userEvent from "@testing-library/user-event";

import { findRequests } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";

import { setup as baseSetup } from "../../tests/setup";
import { EmbeddingSecuritySettings } from "../EmbeddingSecuritySettings";

const setup = async () => {
  await baseSetup({
    renderCallback: ({ state }) =>
      renderWithProviders(<EmbeddingSecuritySettings />, {
        storeInitialState: state,
      }),
  });

  expect(await screen.findByText("Security")).toBeInTheDocument();
};

describe("EmbeddingSecuritySettings => common", () => {
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
