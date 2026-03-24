import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import { createMockRevision } from "metabase-types/api/mocks/revision";

import { RevisionDiffModal } from "./RevisionDiffModal";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup(opts?: Partial<Parameters<typeof RevisionDiffModal>[0]>) {
  const onClose = jest.fn();
  render(
    <RevisionDiffModal
      revision={createMockRevision({
        is_creation: false,
        description: "Updated title",
        user: {
          id: 1,
          first_name: "Alice",
          last_name: "Smith",
          common_name: "Alice Smith",
        },
        diff: {
          before: { title: "Old Title" },
          after: { title: "New Title" },
        },
      })}
      onClose={onClose}
      {...opts}
    />,
  );
  return { onClose };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RevisionDiffModal", () => {
  describe("modal header", () => {
    it("shows the user name and revision description", () => {
      setup();
      expect(screen.getByText("Changes by Alice Smith")).toBeInTheDocument();
      expect(screen.getByText(/Updated title/)).toBeInTheDocument();
    });
  });

  describe("when diff is null", () => {
    it("shows a fallback message", () => {
      setup({
        revision: createMockRevision({ is_creation: false, diff: null }),
      });
      expect(
        screen.getByText("No detailed diff available for this revision."),
      ).toBeInTheDocument();
    });
  });

  describe("when diff has no field keys", () => {
    it("shows a no-changes message", () => {
      setup({
        revision: createMockRevision({
          is_creation: false,
          diff: { before: {}, after: {} },
        }),
      });
      expect(
        screen.getByText("No field-level changes to display."),
      ).toBeInTheDocument();
    });
  });

  describe("field diff sections", () => {
    it("renders a labelled section for each changed field", () => {
      setup({
        revision: createMockRevision({
          is_creation: false,
          diff: {
            before: { title: "Old Title", description: "Old desc" },
            after: { title: "New Title", description: "New desc" },
          },
        }),
      });
      expect(screen.getByText("Title")).toBeInTheDocument();
      expect(screen.getByText("Description")).toBeInTheDocument();
    });

    it("shows 'Before' and 'After' panel headers", () => {
      setup();
      expect(screen.getByText("Before")).toBeInTheDocument();
      expect(screen.getByText("After")).toBeInTheDocument();
    });

    it("does not render a section for fields with no actual changes", () => {
      setup({
        revision: createMockRevision({
          is_creation: false,
          diff: {
            before: { title: "Same Title", description: "Old desc" },
            after: { title: "Same Title", description: "New desc" },
          },
        }),
      });
      // "title" field is unchanged — its section header should not appear
      expect(screen.queryByText("Title")).not.toBeInTheDocument();
      // changed field still renders
      expect(screen.getByText("Description")).toBeInTheDocument();
    });

    it("labels native SQL query fields as 'SQL Query'", () => {
      setup({
        revision: createMockRevision({
          is_creation: false,
          diff: {
            before: {
              dataset_query: {
                type: "native",
                native: { query: "SELECT 1 FROM orders" },
              },
            },
            after: {
              dataset_query: {
                type: "native",
                native: { query: "SELECT 2 FROM orders" },
              },
            },
          },
        }),
      });
      expect(screen.getByText("SQL Query")).toBeInTheDocument();
      expect(screen.queryByText("Dataset Query")).not.toBeInTheDocument();
    });
  });

  describe("collapsible sections", () => {
    it("sections are expanded by default", () => {
      setup();
      expect(screen.getByText("Before")).toBeInTheDocument();
      expect(screen.getByText("After")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Title" })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    });

    it("collapses a section when its header is clicked", async () => {
      setup();
      await userEvent.click(screen.getByRole("button", { name: "Title" }));
      expect(screen.queryByText("Before")).not.toBeInTheDocument();
      expect(screen.queryByText("After")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Title" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    });

    it("re-expands a collapsed section when its header is clicked again", async () => {
      setup();
      const header = screen.getByRole("button", { name: "Title" });
      await userEvent.click(header);
      await userEvent.click(header);
      expect(screen.getByText("Before")).toBeInTheDocument();
      expect(screen.getByText("After")).toBeInTheDocument();
      expect(header).toHaveAttribute("aria-expanded", "true");
    });

    it("collapses each section independently", async () => {
      setup({
        revision: createMockRevision({
          is_creation: false,
          diff: {
            before: { title: "Old Title", description: "Old desc" },
            after: { title: "New Title", description: "New desc" },
          },
        }),
      });
      await userEvent.click(screen.getByRole("button", { name: "Title" }));
      // Title section collapsed; Description section still expanded
      expect(screen.getByRole("button", { name: "Title" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      expect(
        screen.getByRole("button", { name: "Description" }),
      ).toHaveAttribute("aria-expanded", "true");
    });
  });
});
