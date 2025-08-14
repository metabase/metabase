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
  it("should be able to update the name", async () => {
    const { onNameChange } = setup({
      job: createMockTransformJob({ name: "Original Name" }),
    });

    const nameInput = screen.getByDisplayValue("Original Name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "New Name");
    await userEvent.tab();

    expect(onNameChange).toHaveBeenCalledWith("New Name");
  });

  it("should be able to update the description", async () => {
    const { onDescriptionChange } = setup({
      job: createMockTransformJob({ description: "Original description" }),
    });

    const descriptionInput = screen.getByDisplayValue("Original description");
    await userEvent.clear(descriptionInput);
    await userEvent.type(descriptionInput, "New description");
    await userEvent.tab();

    expect(onDescriptionChange).toHaveBeenCalledWith("New description");
  });

  it("should be able to clear the description", async () => {
    const { onDescriptionChange } = setup({
      job: createMockTransformJob({ description: "Some description" }),
    });

    const descriptionInput = screen.getByDisplayValue("Some description");
    await userEvent.clear(descriptionInput);
    await userEvent.tab();

    expect(onDescriptionChange).toHaveBeenCalledWith(null);
  });
});
