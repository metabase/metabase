import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  createMockCollection,
  createMockTimelineData,
} from "metabase-types/api/mocks";

import type { NewTimelineModalProps } from "./NewTimelineModal";
import NewTimelineModal from "./NewTimelineModal";

describe("NewTimelineModal", () => {
  it("should submit modal", async () => {
    const props = getProps();
    const values = createMockTimelineData();

    render(<NewTimelineModal {...props} />);
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
  opts?: Partial<NewTimelineModalProps>,
): NewTimelineModalProps => ({
  collection: createMockCollection(),
  onSubmit: jest.fn(),
  onCancel: jest.fn(),
  onClose: jest.fn(),
  ...opts,
});
