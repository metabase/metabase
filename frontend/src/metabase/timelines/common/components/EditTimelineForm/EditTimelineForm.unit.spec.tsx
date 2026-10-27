import userEvent from "@testing-library/user-event";

import { render, screen, waitFor } from "__support__/ui";
import { createMockTimeline } from "metabase-types/api/mocks";

import type { EditTimelineFormProps } from "./EditTimelineForm";
import EditTimelineForm from "./EditTimelineForm";

describe("EditTimelineForm", () => {
  it("should submit modal", async () => {
    const props = getProps();
    const name = "Another timeline";

    render(<EditTimelineForm {...props} />);
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), name);
    await userEvent.click(screen.getByText("Update"));

    await waitFor(() => {
      expect(props.onSubmit).toHaveBeenCalledWith({ ...props.timeline, name });
    });
  });
});

const getProps = (
  opts?: Partial<EditTimelineFormProps>,
): EditTimelineFormProps => ({
  timeline: createMockTimeline(),
  onSubmit: jest.fn(),
  onArchive: jest.fn(),
  onCancel: jest.fn(),
  ...opts,
});
