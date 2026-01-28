import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

import { TEST_TABLE, setup } from "./setup";

describe("SegmentDetailPage", () => {
  describe("readonly state", () => {
    describe("when remote sync is read-only and table is published", () => {
      beforeEach(() => {
        setup({
          remoteSyncType: "read-only",
          enterprisePlugins: ["remote_sync"],
          tokenFeatures: { remote_sync: true },
          table: { ...TEST_TABLE, is_published: true },
        });
      });

      it("has readonly segment name input", async () => {
        const nameInput = screen.getByDisplayValue("High Value Orders");
        expect(nameInput).toBeDisabled();
      });

      it("shows description as plain text", async () => {
        expect(screen.getByText("Description")).toBeInTheDocument();
        expect(screen.getByText("Orders with total > 100")).toBeInTheDocument();
        expect(
          screen.queryByLabelText("Give it a description"),
        ).not.toBeInTheDocument();
      });

      it("does not show Remove segment option in actions menu", async () => {
        await userEvent.click(screen.getByLabelText("Segment actions"));

        expect(
          screen.getByRole("menuitem", { name: /Preview/ }),
        ).toBeInTheDocument();
        expect(
          screen.queryByRole("menuitem", { name: /Remove segment/ }),
        ).not.toBeInTheDocument();
      });
    });

    describe("when remote sync is read-only and table is not published", () => {
      it("does not show elements as read-only", async () => {
        setup({
          remoteSyncType: "read-only",
          table: { ...TEST_TABLE, is_published: false },
        });

        expect(screen.getByDisplayValue("High Value Orders")).toBeEnabled();
        expect(screen.getByLabelText("Give it a description")).toBeEnabled();

        await userEvent.click(screen.getByLabelText("Segment actions"));

        expect(
          screen.getByRole("menuitem", { name: /Remove segment/ }),
        ).toBeInTheDocument();
      });
    });
  });
});
