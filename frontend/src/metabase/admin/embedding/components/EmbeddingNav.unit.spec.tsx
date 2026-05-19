import { Route } from "react-router";

import { renderWithProviders, screen, within } from "__support__/ui";
import {
  createMockLocation,
  createMockRoutingState,
  createMockSettingsState,
} from "metabase/redux/store/mocks";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { EmbeddingNav } from "./EmbeddingNav";

const setup = ({
  hasSimpleEmbedding = false,
}: {
  hasSimpleEmbedding?: boolean;
} = {}) => {
  const initialRoute = "/admin/embedding/themes";
  const settings = createMockSettings({
    "token-features": createMockTokenFeatures({
      embedding_simple: hasSimpleEmbedding,
    }),
  });

  renderWithProviders(<Route path="*" component={EmbeddingNav} />, {
    withRouter: true,
    initialRoute,
    storeInitialState: {
      currentUser: createMockUser({ is_superuser: true }),
      routing: createMockRoutingState({
        locationBeforeTransitions: createMockLocation({
          pathname: initialRoute,
        }),
      }),
      settings: createMockSettingsState(settings),
    },
  });
};

describe("EmbeddingNav", () => {
  it("shows an upsell gem next to the Themes label for OSS/starter users", () => {
    setup({ hasSimpleEmbedding: false });

    const themesLink = screen.getByRole("link", { name: /Themes/ });
    expect(within(themesLink).getByTestId("upsell-gem")).toBeInTheDocument();
  });

  it("does not show an upsell gem next to the Themes label for Pro users", () => {
    setup({ hasSimpleEmbedding: true });

    const themesLink = screen.getByRole("link", { name: /Themes/ });
    expect(
      within(themesLink).queryByTestId("upsell-gem"),
    ).not.toBeInTheDocument();
  });
});
