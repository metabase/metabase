import userEvent from "@testing-library/user-event";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { render, screen } from "__support__/ui";

const setup = () => {
  const onSubmit = jest.fn();

  render(
    <FormProvider initialValues={{}} onSubmit={onSubmit}>
      <Form>
        <FormSubmitButton />
        <FormErrorMessage />
      </Form>
    </FormProvider>,
  );

  return { onSubmit };
};

describe("FormErrorMessage", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockReturnValue();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should show the default error message", async () => {
    const { onSubmit } = setup();
    onSubmit.mockRejectedValue(new Error());
    userEvent.click(screen.getByText("Submit"));
    expect(await screen.findByText("An error occurred")).toBeInTheDocument();
  });

  it("should show a custom error message", async () => {
    const { onSubmit } = setup();
    onSubmit.mockRejectedValue(new Error("Wrong host or port"));
    userEvent.click(screen.getByText("Submit"));
    expect(await screen.findByText("Wrong host or port")).toBeInTheDocument();
  });
});
