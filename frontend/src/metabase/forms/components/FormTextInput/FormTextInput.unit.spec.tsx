import userEvent from "@testing-library/user-event";
import {
  Form,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { render, screen, waitFor } from "__support__/ui";

interface SetupOpts {
  initialValue?: string | null;
}

const setup = ({ initialValue = "" }: SetupOpts = {}) => {
  const onSubmit = jest.fn();

  render(
    <FormProvider initialValues={{ name: initialValue }} onSubmit={onSubmit}>
      <Form>
        <FormTextInput name="name" label="Name" />
        <FormSubmitButton />
      </Form>
    </FormProvider>,
  );

  return { onSubmit };
};

describe("FormTextInput", () => {
  it("should submit a non-empty value", async () => {
    const { onSubmit } = setup();

    userEvent.type(screen.getByLabelText("Name"), "Test");
    userEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        { name: "Test" },
        expect.anything(),
      );
    });
  });
});
