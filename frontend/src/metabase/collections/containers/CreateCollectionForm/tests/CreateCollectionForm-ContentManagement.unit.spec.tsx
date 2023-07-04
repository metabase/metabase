import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { screen } from "__support__/ui";
import { setup } from "./common";

const TOKEN_FEATURES = createMockTokenFeatures({ content_management: true });

describe("CreateCollectionForm", () => {
  it("shows authority level controls", () => {
    setup({
      tokenFeatures: TOKEN_FEATURES,
    });

    expect(screen.getByText("Collection type")).toBeInTheDocument();
    expect(screen.getByText("Regular")).toBeInTheDocument();
    expect(screen.getByText("Official")).toBeInTheDocument();
  });

  it("does not show authority level controls when the user is not an admin", () => {
    setup({
      user: createMockUser({ is_superuser: false }),
      tokenFeatures: TOKEN_FEATURES,
    });

    expect(screen.queryByText("Collection type")).not.toBeInTheDocument();
  });
});
