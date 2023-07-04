import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { screen } from "__support__/ui";
import { setup, SetupOpts } from "./common";

const setupWithToken = (opts?: SetupOpts) => {
  setup({
    ...opts,
    tokenFeatures: createMockTokenFeatures({ content_management: true }),
  });
};

describe("CreateCollectionForm", () => {
  it("shows authority level controls", () => {
    setupWithToken();

    expect(screen.getByText("Collection type")).toBeInTheDocument();
    expect(screen.getByText("Regular")).toBeInTheDocument();
    expect(screen.getByText("Official")).toBeInTheDocument();
  });

  it("does not show authority level controls when the user is not an admin", () => {
    setupWithToken({
      user: createMockUser({ is_superuser: false }),
    });

    expect(screen.queryByText("Collection type")).not.toBeInTheDocument();
  });
});
