import userEvent from "@testing-library/user-event";
import { t } from "ttag";

import { renderWithProviders, screen } from "__support__/ui";

import {
  CopyQuestionForm,
  type CopyQuestionProperties,
  truncateNameToLimit,
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

const DUPLICATE_POSTFIX = " - " + t`Duplicate`;

describe("CopyQuestionForm", () => {
  it("should not allow to enter a name with more than 254 characters", async () => {
    setup();

    const nameInput = screen.getByLabelText("Name");
    const descriptionInput = screen.getByLabelText("Description");
    const saveButton = screen.getByRole("button", { name: "Duplicate" });

    await userEvent.click(nameInput);
    await userEvent.paste("A".repeat(255));
    await userEvent.click(descriptionInput);
    expect(
      await screen.findByText(/must be 254 characters or less/),
    ).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
  });

  describe("unable to replace a question with a long name (metabase#53042)", () => {
    it("should handle a case when a name contains `Duplicate` and close to the limit of 254 characters", () => {
      setup({
        initialValues: {
          name: "A".repeat(250) + " - " + t`Duplicate`,
        },
      });

      const nameInput = screen.getByLabelText("Name");
      const saveButton = screen.getByRole("button", { name: "Duplicate" });

      expect(nameInput).toHaveValue("A".repeat(242) + DUPLICATE_POSTFIX);
      expect(saveButton).toBeEnabled();
    });
  });
});

describe("truncateNameToLimit", () => {
  it("should truncate the name to 254 characters", () => {
    const name = "A".repeat(255) + DUPLICATE_POSTFIX;
    const truncatedName = "A".repeat(242);

    expect(truncateNameToLimit(name)).toBe(truncatedName + DUPLICATE_POSTFIX);
  });

  it("should have `Duplicate` postfix once if name is truncated", () => {
    const name = "A".repeat(250) + DUPLICATE_POSTFIX;
    const truncatedName = "A".repeat(242);

    expect(truncateNameToLimit(name)).toBe(truncatedName + DUPLICATE_POSTFIX);
  });
});
