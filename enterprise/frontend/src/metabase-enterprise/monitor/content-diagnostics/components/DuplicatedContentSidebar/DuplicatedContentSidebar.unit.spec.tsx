import { renderWithProviders, screen, within } from "__support__/ui";
import type { ContentDiagnosticsDuplicatedFinding } from "metabase-types/api";
import {
  createMockContentDiagnosticsDuplicateEntity,
  createMockContentDiagnosticsDuplicatedFinding,
} from "metabase-types/api/mocks";

import { DuplicatedContentSidebar } from "./DuplicatedContentSidebar";

function setup(
  finding: ContentDiagnosticsDuplicatedFinding = createMockContentDiagnosticsDuplicatedFinding(),
) {
  renderWithProviders(
    <DuplicatedContentSidebar finding={finding} onClose={jest.fn()} />,
    { withRouter: true },
  );
}

function getDuplicatesSection() {
  return screen.getByRole("region", { name: "Duplicates" });
}

describe("DuplicatedContentSidebar", () => {
  it("lists the duplicates with their count in the heading", () => {
    setup(
      createMockContentDiagnosticsDuplicatedFinding({
        duplicate_count: 2,
        details: {
          duplicate_entities: [
            createMockContentDiagnosticsDuplicateEntity({
              id: 11,
              name: "Revenue",
            }),
            createMockContentDiagnosticsDuplicateEntity({
              id: 12,
              name: "revenue",
            }),
          ],
        },
      }),
    );

    const section = getDuplicatesSection();
    expect(within(section).getByText("Duplicates (2)")).toBeInTheDocument();
    expect(within(section).getByText("Revenue")).toBeInTheDocument();
    expect(within(section).getByText("revenue")).toBeInTheDocument();
  });

  it("links each duplicate and labels it with its type", () => {
    setup(
      createMockContentDiagnosticsDuplicatedFinding({
        duplicate_count: 1,
        details: {
          duplicate_entities: [
            createMockContentDiagnosticsDuplicateEntity({
              id: 11,
              name: "Revenue",
              entity_type: "card",
              card_type: "model",
            }),
          ],
        },
      }),
    );

    const link = within(getDuplicatesSection()).getByRole("link", {
      name: "Revenue, Model",
    });
    expect(link).toHaveAttribute("href", expect.stringContaining("/model/11"));
  });

  it("shows the view count of a duplicate", () => {
    setup(
      createMockContentDiagnosticsDuplicatedFinding({
        duplicate_count: 1,
        details: {
          duplicate_entities: [
            createMockContentDiagnosticsDuplicateEntity({ view_count: 12 }),
          ],
        },
      }),
    );

    expect(
      within(getDuplicatesSection()).getByText("12 views"),
    ).toBeInTheDocument();
  });

  it("omits the view count for duplicates that have none", () => {
    setup(
      createMockContentDiagnosticsDuplicatedFinding({
        duplicate_count: 1,
        details: {
          duplicate_entities: [
            createMockContentDiagnosticsDuplicateEntity({
              entity_type: "transform",
              name: "daily_rollup",
              view_count: undefined,
            }),
          ],
        },
      }),
    );

    const section = getDuplicatesSection();
    expect(within(section).getByText("daily_rollup")).toBeInTheDocument();
    expect(within(section).queryByText(/views?$/)).not.toBeInTheDocument();
  });

  it("reports how many duplicates aren't visible to the user", () => {
    setup(
      createMockContentDiagnosticsDuplicatedFinding({
        duplicate_count: 3,
        details: {
          duplicate_entities: [createMockContentDiagnosticsDuplicateEntity()],
        },
      }),
    );

    expect(
      within(getDuplicatesSection()).getByText(
        "2 duplicates aren't visible to you.",
      ),
    ).toBeInTheDocument();
  });

  it("reports when none of the duplicates are visible to the user", () => {
    setup(
      createMockContentDiagnosticsDuplicatedFinding({
        duplicate_count: 2,
        details: { duplicate_entities: [] },
      }),
    );

    expect(
      within(getDuplicatesSection()).getByText(
        "None of these duplicates are visible to you.",
      ),
    ).toBeInTheDocument();
  });
});
