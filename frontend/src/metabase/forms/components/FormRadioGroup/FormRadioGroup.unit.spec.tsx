import userEvent from "@testing-library/user-event";
import type { AnySchema } from "yup";
import * as Yup from "yup";

import { render, screen, waitFor } from "__support__/ui";
import {
  Form,
  FormRadioGroup,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Radio } from "metabase/ui";

interface FormValues {
  column?: string;
}

interface SetupOpts {
  initialValues?: FormValues;
  validationSchema?: AnySchema;
}

const setup = ({
  initialValues = { column: undefined },
  validationSchema,
}: SetupOpts = {}) => {
  const onSubmit = jest.fn();

  render(
    <FormProvider
      initialValues={initialValues}
      validationSchema={validationSchema}
      onSubmit={onSubmit}
    >
      <Form>
        <FormRadioGroup name="column" label="Column">
          <Radio value="id" label="ID" />
          <Radio value="name" label="Name" />
        </FormRadioGroup>
        <FormSubmitButton />
      </Form>
    </FormProvider>,
  );

  return { onSubmit };
};

describe("FormRadioGroup", () => {
  it("should show the initial value", () => {
    setup({
      initialValues: { column: "id" },
    });

    expect(screen.getByLabelText("ID")).toBeChecked();
    expect(screen.getByLabelText("Name")).not.toBeChecked();
  });

  it("should submit a non-empty value", async () => {
    const { onSubmit } = setup();

    await userEvent.click(screen.getByLabelText("Name"));
    await userEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        {
          column: "name",
        },
        expect.anything(),
      );
    });
  });

  it("should show validation errors", async () => {
    // This is test used to test setting and unsetting the radio value, but userEvents 14
    // cause this to not work (we weren't able to unselect the radio). To simulate, we have
    // repaced the logic with a nonsense validation object to error after setting the value
    const validationSchema = Yup.object({
      column: Yup.string().email("This should error"),
    });
    setup({
      initialValues: validationSchema.getDefault(),
      validationSchema: validationSchema,
    });
    expect(screen.queryByText("This should error")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Submit"));

    await userEvent.click(screen.getByLabelText("Name"));
    await userEvent.tab();

    await waitFor(() => {
      expect(screen.getByText("This should error")).toBeInTheDocument();
    });
  });
});
