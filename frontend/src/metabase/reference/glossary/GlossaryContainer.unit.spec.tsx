import fetchMock from "fetch-mock";

import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import type { GlossaryItem } from "metabase/api";
import { createMockUser } from "metabase-types/api/mocks";

import { GlossaryContainer } from "./GlossaryContainer";

const GLOSSARY: GlossaryItem[] = [
  { id: 1, term: "ARR", definition: "Annual recurring revenue" },
];

// Writability comes from the API: `can_write` mirrors api/entitled-data-analyst?, which gates the
// glossary write endpoints, so the container never has to reason about roles or token features itself.
const setup = ({ canWrite }: { canWrite: boolean }) => {
  fetchMock.get("path:/api/glossary", { data: GLOSSARY, can_write: canWrite });

  renderWithProviders(<GlossaryContainer />, {
    storeInitialState: createMockState({
      currentUser: createMockUser(),
    }),
    withRouter: true,
  });
};

const getNewTermButton = () => screen.queryByRole("button", { name: /term/i });

describe("GlossaryContainer", () => {
  it("lets the user manage the glossary when the API reports it as writable", async () => {
    setup({ canWrite: true });

    expect(await screen.findByText("ARR")).toBeInTheDocument();
    expect(getNewTermButton()).toBeInTheDocument();
  });

  it("makes the glossary read-only when the API reports it as not writable", async () => {
    setup({ canWrite: false });

    expect(await screen.findByText("ARR")).toBeInTheDocument();
    expect(getNewTermButton()).not.toBeInTheDocument();
  });
});
