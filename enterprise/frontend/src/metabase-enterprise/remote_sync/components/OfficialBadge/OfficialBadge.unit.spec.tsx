import { renderWithProviders, screen } from "__support__/ui";
import type { OfficialCollection } from "metabase/plugins";

import { OfficialBadge } from "./OfficialBadge";

type SetupOpts = {
  collection: OfficialCollection | null | undefined;
  showLabel?: boolean;
};

const setup = ({ collection, showLabel }: SetupOpts) => {
  renderWithProviders(
    <OfficialBadge collection={collection} showLabel={showLabel} />,
  );
};

describe("OfficialBadge", () => {
  it("renders official icon for remote synced collection", () => {
    setup({ collection: { is_remote_synced: true } });

    expect(screen.getByTestId("official-badge")).toHaveAttribute(
      "aria-label",
      "official_collection icon",
    );
    expect(screen.queryByText("Official")).not.toBeInTheDocument();
  });

  it("renders icon with label when showLabel is set", () => {
    setup({ collection: { is_remote_synced: true }, showLabel: true });

    expect(screen.getByTestId("official-badge")).toHaveTextContent("Official");
    expect(
      screen.getByRole("img", { name: "official_collection icon" }),
    ).toBeInTheDocument();
  });

  it.each([{ is_remote_synced: false }, {}, null, undefined])(
    "renders nothing for %p",
    (collection) => {
      setup({ collection, showLabel: true });

      expect(screen.queryByTestId("official-badge")).not.toBeInTheDocument();
    },
  );
});
