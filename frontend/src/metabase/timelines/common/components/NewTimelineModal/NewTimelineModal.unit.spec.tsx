import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMockCollection,
  createMockTimelineData,
} from "metabase-types/api/mocks";
import NewTimelineModal, { NewTimelineModalProps } from "./NewTimelineModal";

describe("NewTimelineModal", () => {
  it("should submit modal", async () => {
    const props = getProps();
    const values = createMockTimelineData();

    render(<NewTimelineModal {...props} />);
    userEvent.type(screen.getByLabelText("Name"), values.name);
    await waitFor(() => {
      expect(screen.getByText("Create")).toBeEnabled();
    });

    userEvent.click(screen.getByText("Create"));
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
