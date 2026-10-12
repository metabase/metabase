import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";

import { EnableEmbeddingPrompt } from "./EnableEmbeddingPrompt";

interface SetupOpts {
  isEnabled: boolean;
  isTermsAccepted: boolean;
}

const setup = ({ isEnabled, isTermsAccepted }: SetupOpts) => {
  setupPropertiesEndpoints(createMockSettings());
  setupSettingsEndpoints([]);
  setupUpdateSettingsEndpoint();

  renderWithProviders(
    <EnableEmbeddingPrompt
      isEnabled={isEnabled}
      isTermsAccepted={isTermsAccepted}
    />,
  );
};

describe("EnableEmbeddingPrompt", () => {
  it("enables modular embedding right away when the terms are already accepted", async () => {
    setup({ isEnabled: false, isTermsAccepted: true });

    expect(
      screen.getByText(
        "Enable modular embedding to see a live preview of your theme.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "usage conditions" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Enable modular embedding" }),
    );

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0].body).toEqual({ "enable-embedding-modular": true });
  });

  it("shows the usage conditions before enabling modular embedding for the first time", async () => {
    setup({ isEnabled: false, isTermsAccepted: false });

    expect(
      screen.getByText(/enable modular embedding and agree to the/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "usage conditions" }),
    ).toHaveAttribute("href", "https://metabase.com/license/embedding");

    await userEvent.click(
      screen.getByRole("button", { name: "Enable modular embedding" }),
    );

    expect(
      await screen.findByText("Each end user needs their own Metabase account"),
    ).toBeInTheDocument();
    expect(await findRequests("PUT")).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Agree" }));

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0].body).toEqual({
      "enable-embedding-modular": true,
      "show-modular-embed-terms": false,
    });
  });

  it("links to the usage conditions when only the terms are pending", async () => {
    setup({ isEnabled: true, isTermsAccepted: false });

    expect(
      screen.getByText(/to see a live preview of your theme\./),
    ).toBeInTheDocument();

    const link = screen.getByRole("link", { name: "usage conditions" });
    expect(link).toHaveAttribute(
      "href",
      "https://metabase.com/license/embedding",
    );
    expect(link).toHaveAttribute("target", "_blank");

    await userEvent.click(
      screen.getByRole("button", { name: "Accept and continue" }),
    );

    expect(
      await screen.findByText("Each end user needs their own Metabase account"),
    ).toBeInTheDocument();
    expect(await findRequests("PUT")).toHaveLength(0);
  });
});
