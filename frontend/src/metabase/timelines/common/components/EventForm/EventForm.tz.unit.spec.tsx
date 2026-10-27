import userEvent from "@testing-library/user-event";

import testAcrossTimezones from "__support__/timezones";
import { render, screen, waitFor } from "__support__/ui";
import type { TimelineEventData } from "metabase-types/api";
import { createMockTimelineEventData } from "metabase-types/api/mocks";

import EventForm from "./EventForm";

interface SetupOpts {
  initialValues: TimelineEventData;
}

const setup = ({ initialValues }: SetupOpts) => {
  const onSubmit = jest.fn();

  render(<EventForm initialValues={initialValues} onSubmit={onSubmit} />);

  return { onSubmit };
};

testAcrossTimezones(() => {
  describe("EventForm", () => {
    it("should save the picked date without shifting it to another day (#24701)", async () => {
      const { onSubmit } = setup({
        initialValues: createMockTimelineEventData({ name: "", timestamp: "" }),
      });

      await userEvent.type(screen.getByLabelText("Event name"), "Launch");
      const dateInput = screen.getByLabelText("Date");
      await userEvent.clear(dateInput);
      await userEvent.type(dateInput, "January 1, 2026");
      await userEvent.click(screen.getByRole("button", { name: "Create" }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({ timestamp: "2026-01-01T00:00:00.000Z" }),
        );
      });
    });

    it("should show the saved date and time of an existing event (#24701)", () => {
      setup({
        initialValues: createMockTimelineEventData({
          id: 1,
          timestamp: "2026-01-01T17:00:00Z",
          time_matters: true,
        }),
      });

      expect(screen.getByLabelText<HTMLInputElement>("Date").value).toBe(
        "January 1, 2026",
      );
      expect(screen.getByLabelText<HTMLInputElement>("Time").value).toBe(
        "17:00",
      );
    });
  });
});
