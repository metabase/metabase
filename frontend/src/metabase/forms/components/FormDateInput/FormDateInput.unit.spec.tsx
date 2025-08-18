import userEvent from "@testing-library/user-event";

import { render, screen, waitFor } from "__support__/ui";
import {
  Form,
  FormDateInput,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";

const setup = ({ initialValue }: { initialValue: string }) => {
  const onSubmit = jest.fn();

  render(
    <FormProvider
      initialValues={{ birthday: initialValue }}
      onSubmit={onSubmit}
    >
      <Form>
        <FormDateInput
          name="birthday"
          title="Birthday"
          valueFormat="MM/DD/YYYY"
        />
        <FormSubmitButton />
      </Form>
    </FormProvider>,
  );

  return { onSubmit };
};

describe("FormDateInput", () => {
  it("should use the initial value from the form", () => {
    setup({
      initialValue: new Date("2022-10-20 12:00:00").toString(),
    });

    expect(screen.getByRole("textbox")).toHaveValue("10/20/2022");
  });

  it("should propagate the changed value to the form", async () => {
    const { onSubmit } = setup({
      initialValue: "",
    });

    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "10/20/22");
    await userEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      const value = expect.stringMatching(/2022-10-20/);
      expect(onSubmit).toHaveBeenCalledWith(
        { birthday: value },
        expect.anything(),
      );
    });
  });

  it("should be referenced by the label", () => {
    setup({
      initialValue: "2022-10-20",
    });

    expect(screen.getByLabelText("Birthday")).toBeInTheDocument();
  });
});
