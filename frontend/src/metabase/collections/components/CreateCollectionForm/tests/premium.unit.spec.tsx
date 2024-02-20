import { screen } from "__support__/ui";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { setup } from "./setup";

const setupPremium = (opts?: SetupOpts) => {
  setup({
    ...opts,
    tokenFeatures: createMockTokenFeatures({ official_collections: true }),
    hasEnterprisePlugins: true,
  });
};

describe("CreateCollectionForm", () => {
  it("shows authority level controls", () => {
    setupPremium();
    expect(screen.getByText("Collection type")).toBeInTheDocument();
    expect(screen.getByText("Regular")).toBeInTheDocument();
    expect(screen.getByText("Official")).toBeInTheDocument();
  });

  it("does not show authority level controls when the user is not an admin", () => {
    setupPremium({ user: createMockUser({ is_superuser: false }) });
    expect(screen.queryByText("Collection type")).not.toBeInTheDocument();
  });
});
