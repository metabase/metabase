import fetchMock from "fetch-mock";

import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import type { GlossaryItem } from "metabase/api";
import type { TokenFeatures, User } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { GlossaryContainer } from "./GlossaryContainer";

const GLOSSARY: GlossaryItem[] = [
  { id: 1, term: "ARR", definition: "Annual recurring revenue" },
];

interface SetupOpts {
  user: Partial<User>;
  tokenFeatures?: Partial<TokenFeatures>;
}

const setup = ({ user, tokenFeatures = {} }: SetupOpts) => {
  fetchMock.get("path:/api/glossary", { data: GLOSSARY });

  renderWithProviders(<GlossaryContainer />, {
    storeInitialState: createMockState({
      currentUser: createMockUser(user),
      settings: mockSettings({
        "token-features": createMockTokenFeatures(tokenFeatures),
      }),
    }),
    withRouter: true,
  });
};

const getNewTermButton = () => screen.queryByRole("button", { name: /term/i });

describe("GlossaryContainer", () => {
  it("lets admins manage the glossary without advanced-permissions", async () => {
    setup({
      user: { is_superuser: true, is_data_analyst: false },
      tokenFeatures: { advanced_permissions: false },
    });

    expect(await screen.findByText("ARR")).toBeInTheDocument();
    expect(getNewTermButton()).toBeInTheDocument();
  });

  it("lets analysts manage the glossary with advanced-permissions", async () => {
    setup({
      user: { is_superuser: false, is_data_analyst: true },
      tokenFeatures: { advanced_permissions: true },
    });

    expect(await screen.findByText("ARR")).toBeInTheDocument();
    expect(getNewTermButton()).toBeInTheDocument();
  });

  it("makes the glossary read-only for analysts without advanced-permissions", async () => {
    setup({
      user: { is_superuser: false, is_data_analyst: true },
      tokenFeatures: { advanced_permissions: false },
    });

    expect(await screen.findByText("ARR")).toBeInTheDocument();
    expect(getNewTermButton()).not.toBeInTheDocument();
  });

  it("makes the glossary read-only for everyone else", async () => {
    setup({
      user: { is_superuser: false, is_data_analyst: false },
      tokenFeatures: { advanced_permissions: true },
    });

    expect(await screen.findByText("ARR")).toBeInTheDocument();
    expect(getNewTermButton()).not.toBeInTheDocument();
  });
});
