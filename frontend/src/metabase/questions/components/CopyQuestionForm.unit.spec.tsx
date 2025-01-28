import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import {
  CopyQuestionForm,
  type CopyQuestionProperties,
} from "./CopyQuestionForm";

type SetupOpts = {
  initialValues?: Partial<CopyQuestionProperties>;
};

function setup({ initialValues = {} }: SetupOpts = {}) {
  const onSubmit = jest.fn();
  const onSaved = jest.fn();
  const onCancel = jest.fn();

  renderWithProviders(
    <CopyQuestionForm
      initialValues={initialValues}
      onSubmit={onSubmit}
      onSaved={onSaved}
      onCancel={onCancel}
    />,
  );

  return { onSubmit, onSaved, onCancel };
}

describe("CopyQuestionForm", () => {
  it("should not allow to enter a name with more than 254 characters", async () => {
    setup();

    const nameInput = screen.getByLabelText("Name");
    const descriptionInput = screen.getByLabelText("Description");
    const saveButton = screen.getByRole("button", { name: "Duplicate" });

    await userEvent.type(nameInput, "A".repeat(254));
    await userEvent.click(descriptionInput);
    expect(
      screen.queryByText(/must be 254 characters or less/),
    ).not.toBeInTheDocument();
    expect(saveButton).toBeEnabled();

    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "A".repeat(255));
    await userEvent.click(descriptionInput);
    expect(
      await screen.findByText(/must be 254 characters or less/),
    ).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
  });
});
