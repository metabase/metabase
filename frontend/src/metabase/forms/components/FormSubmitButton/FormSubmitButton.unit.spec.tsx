import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import { Form, FormProvider, FormSubmitButton } from "metabase/forms";

interface SetupOpts {
  label?: string;
  activeLabel?: string;
  successLabel?: string;
  failedLabel?: string;
}

const setup = ({
  label,
  activeLabel,
  successLabel,
  failedLabel,
}: SetupOpts = {}) => {
  const onSubmit = jest.fn();

  render(
    <FormProvider initialValues={{}} onSubmit={onSubmit}>
      <Form>
        <FormSubmitButton
          label={label}
          activeLabel={activeLabel}
          successLabel={successLabel}
          failedLabel={failedLabel}
        />
      </Form>
    </FormProvider>,
  );

  return { onSubmit };
};

describe("FormSubmitButton", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockReturnValue();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should show the default success message", async () => {
    const { onSubmit } = setup();
    onSubmit.mockResolvedValue(true);
    await userEvent.click(screen.getByText("Submit"));
    expect(await screen.findByText("Success")).toBeInTheDocument();
  });

  it("should show a custom success message", async () => {
    const { onSubmit } = setup({ label: "Save", successLabel: "Saved" });
    onSubmit.mockResolvedValue(true);
    await userEvent.click(screen.getByText("Save"));
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("should show the default error message", async () => {
    const { onSubmit } = setup();
    onSubmit.mockRejectedValue(new Error("An error occurred"));
    await userEvent.click(screen.getByText("Submit"));
    expect(await screen.findByText("Failed")).toBeInTheDocument();
  });

  it("should show a custom error message", async () => {
    const { onSubmit } = setup({ failedLabel: "Error" });
    onSubmit.mockRejectedValue(new Error("An error occurred"));
    await userEvent.click(screen.getByText("Submit"));
    expect(await screen.findByText("Error")).toBeInTheDocument();
  });
});
