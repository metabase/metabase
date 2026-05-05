import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { TransformRun } from "metabase-types/api";
import {
  createMockTransform,
  createMockTransformRun,
} from "metabase-types/api/mocks";

import { SidebarHeader } from "./SidebarHeader";

type SetupOpts = {
  run?: TransformRun;
};

function setup({ run = createMockTransformRun() }: SetupOpts = {}) {
  const onClose = jest.fn();
  renderWithProviders(<SidebarHeader run={run} onClose={onClose} />);
  return { onClose };
}

describe("SidebarHeader", () => {
  it("should render the transform name", () => {
    const transform = createMockTransform({ name: "My Transform" });
    const run = createMockTransformRun({ transform });
    setup({ run });

    expect(screen.getByText("My Transform")).toBeInTheDocument();
  });

  it("should render 'Unknown transform' when transform is not set", () => {
    const run = createMockTransformRun({ transform: undefined });
    setup({ run });

    expect(screen.getByText("Unknown transform")).toBeInTheDocument();
  });

  it("should show the external link when transform is set", () => {
    const transform = createMockTransform({ id: 42 });
    const run = createMockTransformRun({ transform });
    setup({ run });

    expect(screen.getByLabelText("View this transform")).toBeInTheDocument();
  });

  it("should not show the external link when transform is not set", () => {
    const run = createMockTransformRun({ transform: undefined });
    setup({ run });

    expect(
      screen.queryByLabelText("View this transform"),
    ).not.toBeInTheDocument();
  });

  it("should call onClose when the close button is clicked", async () => {
    const { onClose } = setup();

    await userEvent.click(screen.getByLabelText("Close"));

    expect(onClose).toHaveBeenCalled();
  });
});
