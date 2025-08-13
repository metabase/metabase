import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockTransformJob } from "metabase-types/api/mocks";

import type { TransformJobInfo } from "../types";

import { NameSection } from "./NameSection";

type SetupOpts = {
  job?: TransformJobInfo;
};

function setup({ job = createMockTransformJob() }: SetupOpts = {}) {
  const onNameChange = jest.fn();
  const onDescriptionChange = jest.fn();

  renderWithProviders(
    <NameSection
      job={job}
      onNameChange={onNameChange}
      onDescriptionChange={onDescriptionChange}
    />,
  );

  return {
    onNameChange,
    onDescriptionChange,
  };
}

describe("NameSection", () => {
  it("should render the job name and description", () => {
    setup({
      job: createMockTransformJob({
        name: "Test Job",
        description: "Test description",
      }),
    });

    expect(screen.getByDisplayValue("Test Job")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Test description")).toBeInTheDocument();
  });

  it("should render placeholder when description is null", () => {
    setup({
      job: createMockTransformJob({
        name: "Test Job",
        description: null,
      }),
    });

    expect(screen.getByDisplayValue("Test Job")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("No description yet"),
    ).toBeInTheDocument();
  });

  it("should call onNameChange when name is edited", async () => {
    const { onNameChange } = setup({
      job: createMockTransformJob({ name: "Original Name" }),
    });

    const nameInput = screen.getByDisplayValue("Original Name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "New Name");

    expect(onNameChange).toHaveBeenCalledWith("New Name");
  });

  it("should call onDescriptionChange when description is edited", async () => {
    const { onDescriptionChange } = setup({
      job: createMockTransformJob({ description: "Original description" }),
    });

    const descriptionInput = screen.getByDisplayValue("Original description");
    await userEvent.clear(descriptionInput);
    await userEvent.type(descriptionInput, "New description");

    expect(onDescriptionChange).toHaveBeenCalledWith("New description");
  });

  it("should call onDescriptionChange with null when description is cleared", async () => {
    const { onDescriptionChange } = setup({
      job: createMockTransformJob({ description: "Some description" }),
    });

    const descriptionInput = screen.getByDisplayValue("Some description");
    await userEvent.clear(descriptionInput);

    expect(onDescriptionChange).toHaveBeenCalledWith(null);
  });
});
