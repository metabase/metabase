import type { NodeViewProps } from "@tiptap/react";

import {
  setupCardEndpoints,
  setupUnauthorizedCardEndpoints,
} from "__support__/server-mocks";
import { getIcon, renderWithProviders, screen } from "__support__/ui";
import { createMockCard } from "metabase-types/api/mocks";

import { SmartLinkComponent } from "./SmartLinkNode";

function setup({ cardId, label }: { cardId: number; label: string }) {
  // NodeViewProps carries the full editor/node API; SmartLinkComponent only reads node.attrs and updateAttributes.
  const props = {
    node: { attrs: { entityId: cardId, model: "card", label } },
    updateAttributes: jest.fn(),
  } as unknown as NodeViewProps;
  renderWithProviders(<SmartLinkComponent {...props} />, { withRouter: true });
}

describe("SmartLink access", () => {
  it("renders a link named after the current card name, not the cached label", async () => {
    const card = createMockCard({ id: 12, name: "Current card name" });
    setupCardEndpoints(card);
    setup({ cardId: card.id, label: "cached name" });

    expect(
      await screen.findByRole("link", { name: /Current card name/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /cached name/ }),
    ).not.toBeInTheDocument();
  });

  it("renders 'No access' with a crossed-out eye when the card request is forbidden", async () => {
    const card = createMockCard({ id: 13, name: "Secret card" });
    setupUnauthorizedCardEndpoints(card);
    setup({ cardId: card.id, label: "cached name" });

    expect(await screen.findByText("No access")).toBeInTheDocument();
    expect(getIcon("eye_crossed_out")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText("cached name")).not.toBeInTheDocument();
  });
});
