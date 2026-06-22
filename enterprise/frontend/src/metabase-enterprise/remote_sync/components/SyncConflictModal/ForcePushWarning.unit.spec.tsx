import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import type { ForcePushCasualties } from "metabase-types/api";

import { ForcePushWarning } from "./ForcePushWarning";

const setup = (
  casualties: ForcePushCasualties,
  { branch = "main", historyRewritten = false } = {},
) => {
  render(
    <ForcePushWarning
      casualties={casualties}
      branch={branch}
      historyRewritten={historyRewritten}
    />,
  );
};

describe("ForcePushWarning", () => {
  it("renders nothing when there is nothing to lose", () => {
    setup({ deleted: [], overwritten: [] });
    expect(screen.queryByText("Show files")).not.toBeInTheDocument();
    expect(screen.queryByText(/permanently deleted/)).not.toBeInTheDocument();
  });

  it("summarizes deleted files with the branch name", () => {
    setup({ deleted: ["Card A (collections/a.yaml)"], overwritten: [] });
    expect(
      screen.getByText(/1 file on main.*permanently deleted/),
    ).toBeInTheDocument();
  });

  it("pluralizes the deleted-file count", () => {
    setup({
      deleted: ["Card A (collections/a.yaml)", "Card B (collections/b.yaml)"],
      overwritten: [],
    });
    expect(
      screen.getByText(/2 files on main.*permanently deleted/),
    ).toBeInTheDocument();
  });

  it("summarizes overwritten files", () => {
    setup({ deleted: [], overwritten: ["Card C (collections/c.yaml)"] });
    expect(
      screen.getByText(
        /1 file.s changes on main will be discarded and overwritten/,
      ),
    ).toBeInTheDocument();
  });

  it("explains when the remote history was rewritten", () => {
    setup(
      { deleted: ["Card A (collections/a.yaml)"], overwritten: [] },
      { historyRewritten: true },
    );
    expect(screen.getByText(/history was rewritten/)).toBeInTheDocument();
  });

  it("omits the rewritten-history note for a normal divergence", () => {
    setup({ deleted: ["Card A (collections/a.yaml)"], overwritten: [] });
    expect(screen.queryByText(/history was rewritten/)).not.toBeInTheDocument();
  });

  it("toggles the file list open and closed", async () => {
    setup({
      deleted: ["Card A (collections/a.yaml)"],
      overwritten: ["Card C (collections/c.yaml)"],
    });

    expect(screen.getByText("Show files")).toBeInTheDocument();
    expect(screen.queryByText("Hide files")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Show files"));

    expect(screen.getByText("Hide files")).toBeInTheDocument();
    expect(screen.getByText("Will be deleted")).toBeInTheDocument();
    expect(screen.getByText("Will be overwritten")).toBeInTheDocument();
    expect(screen.getByText("Card A (collections/a.yaml)")).toBeInTheDocument();
    expect(screen.getByText("Card C (collections/c.yaml)")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Hide files"));
    expect(screen.getByText("Show files")).toBeInTheDocument();
  });
});
