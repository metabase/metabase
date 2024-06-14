import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { type InteractiveEmbeddingCTASetupOptions, setup } from "./setup";

const setupPremium = (opts?: Partial<InteractiveEmbeddingCTASetupOptions>) => {
  return setup({
    ...opts,
    tokenFeatures: createMockTokenFeatures({ embedding: true }),
    hasEnterprisePlugins: true,
  });
};

describe("InteractiveEmbeddingCTA", () => {
  it("should display a link to the embedding settings when plan is pro", async () => {
    const { history } = setupPremium();

    expect(screen.getByText("Interactive Embedding")).toBeInTheDocument();
    expect(screen.queryByText("Pro")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Your plan allows you to use Interactive Embedding create interactive embedding experiences with drill-through and more.",
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("interactive-embedding-cta"));

    expect(history.getCurrentLocation().pathname).toEqual(
      "/admin/settings/embedding-in-other-applications/full-app",
    );
  });
});
