import userEvent from "@testing-library/user-event";

import { render, screen, waitFor } from "__support__/ui";
import {
  createMockCollection,
  createMockTimelineData,
} from "metabase-types/api/mocks";

import type { NewTimelineFormProps } from "./NewTimelineForm";
import NewTimelineForm from "./NewTimelineForm";

describe("NewTimelineForm", () => {
  it("should submit modal", async () => {
    const props = getProps();
    const values = createMockTimelineData();

    render(<NewTimelineForm {...props} />);
    await userEvent.type(screen.getByLabelText("Name"), values.name);
    await waitFor(() => {
      expect(screen.getByText("Create")).toBeEnabled();
    });

    await userEvent.click(screen.getByText("Create"));
    await waitFor(() => {
      expect(props.onSubmit).toHaveBeenCalledWith(values, props.collection);
    });
  });
});

const getProps = (
  opts?: Partial<NewTimelineFormProps>,
): NewTimelineFormProps => ({
  collection: createMockCollection(),
  onSubmit: jest.fn(),
  onCancel: jest.fn(),
  ...opts,
});
