import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import { createMockTimelineEvent } from "metabase-types/api/mocks";

import type { DeleteEventFooterProps } from "./DeleteEventFooter";
import DeleteEventFooter from "./DeleteEventFooter";

describe("DeleteEventFooter", () => {
  it("should submit modal", async () => {
    const props = getProps();

    render(<DeleteEventFooter {...props} />);
    await userEvent.click(screen.getByText("Delete"));

    expect(props.onSubmit).toHaveBeenCalled();
  });
});

const getProps = (
  opts?: Partial<DeleteEventFooterProps>,
): DeleteEventFooterProps => ({
  event: createMockTimelineEvent(),
  onSubmit: jest.fn(),
  onCancel: jest.fn(),
  ...opts,
});
