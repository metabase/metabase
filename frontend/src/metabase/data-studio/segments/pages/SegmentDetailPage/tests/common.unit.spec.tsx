import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, waitFor } from "__support__/ui";
import { createMockSegment } from "metabase-types/api/mocks";

import { TEST_SEGMENT, setup } from "./setup";

describe("SegmentDetailPage", () => {
  it("renders page with segment data, tabs, and actions menu", async () => {
    setup();

    expect(screen.getByDisplayValue("High Value Orders")).toBeInTheDocument();
    expect(screen.getByLabelText("Give it a description")).toHaveValue(
      "Orders with total > 100",
    );
    expect(screen.getByText("Definition")).toBeInTheDocument();
    expect(screen.getByText("Revision history")).toBeInTheDocument();
    expect(screen.getByLabelText("Segment actions")).toBeInTheDocument();
  });

  it("does not show Save/Cancel buttons when form is pristine", async () => {
    setup();

    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
  });

  it("shows Save/Cancel buttons when description is modified", async () => {
    setup();

    const descriptionInput = screen.getByLabelText("Give it a description");
    await userEvent.clear(descriptionInput);
    await userEvent.type(descriptionInput, "New description");

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("resets form when Cancel is clicked after modifying description", async () => {
    setup();

    const descriptionInput = screen.getByLabelText("Give it a description");
    await userEvent.clear(descriptionInput);
    await userEvent.type(descriptionInput, "Modified description");
    expect(descriptionInput).toHaveValue("Modified description");

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(descriptionInput).toHaveValue("Orders with total > 100");
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
  });

  it("calls update API and preserves form state after successful save", async () => {
    const updatedSegment = {
      ...TEST_SEGMENT,
      description: "Updated description",
    };

    fetchMock.put(`path:/api/segment/${TEST_SEGMENT.id}`, updatedSegment);

    setup();

    const descriptionInput = screen.getByLabelText("Give it a description");
    await userEvent.clear(descriptionInput);
    await userEvent.type(descriptionInput, "Updated description");

    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toBeEnabled();

    await userEvent.click(saveButton);

    await waitFor(() => {
      const calls = fetchMock.callHistory.calls(
        `path:/api/segment/${TEST_SEGMENT.id}`,
      );
      expect(calls.length).toBeGreaterThan(0);
    });

    expect(descriptionInput).toHaveValue("Updated description");
    await waitFor(() => {
      expect(screen.getByText(/Total is greater than/)).toBeInTheDocument();
    });
  });

  it("displays existing filter from segment definition", async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByText(/Total is greater than/)).toBeInTheDocument();
    });
  });

  it("opens actions menu with Preview and Remove options when clicking menu button", async () => {
    setup();

    await userEvent.click(screen.getByLabelText("Segment actions"));

    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByText("Remove segment")).toBeInTheDocument();
  });

  it("shows confirmation modal when Remove segment is clicked", async () => {
    setup();

    await userEvent.click(screen.getByLabelText("Segment actions"));
    await userEvent.click(screen.getByText("Remove segment"));

    expect(screen.getByText("Remove this segment?")).toBeInTheDocument();
    expect(
      screen.getByText("This segment will be permanently removed."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  describe("readonly state for non-admin users", () => {
    it("has readonly segment name input", async () => {
      setup({ isAdmin: false });

      const nameInput = screen.getByDisplayValue("High Value Orders");
      expect(nameInput).toBeDisabled();
    });

    it("shows description as plain text", async () => {
      setup({ isAdmin: false });

      expect(screen.getByText("Description")).toBeInTheDocument();
      expect(screen.getByText("Orders with total > 100")).toBeInTheDocument();
      expect(
        screen.queryByLabelText("Give it a description"),
      ).not.toBeInTheDocument();
    });

    it("hides description section when there is no description", async () => {
      setup({
        isAdmin: false,
        segment: createMockSegment({ ...TEST_SEGMENT, description: "" }),
      });

      expect(screen.queryByText("Description")).not.toBeInTheDocument();
    });

    it("does not show Remove segment option in actions menu", async () => {
      setup({ isAdmin: false });

      await userEvent.click(screen.getByLabelText("Segment actions"));

      expect(screen.getByText("Preview")).toBeInTheDocument();
      expect(screen.queryByText("Remove segment")).not.toBeInTheDocument();
    });

    it("does not show Save/Cancel buttons", async () => {
      setup({ isAdmin: false });

      expect(
        screen.queryByRole("button", { name: "Save" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Cancel" }),
      ).not.toBeInTheDocument();
    });
  });
});
