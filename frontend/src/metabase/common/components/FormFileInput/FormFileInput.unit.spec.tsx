import userEvent from "@testing-library/user-event";
import type { AnySchema } from "yup";
import * as Yup from "yup";

import { render, screen, waitFor } from "__support__/ui";
import { Form, FormProvider, FormSubmitButton } from "metabase/forms";

import { FormFileInput, type FormFileInputEncoding } from "./FormFileInput";

interface FormValues {
  certificate: string;
}

interface SetupOpts {
  encoding?: FormFileInputEncoding;
  validationSchema?: AnySchema;
}

const setup = ({ encoding, validationSchema }: SetupOpts = {}) => {
  const onSubmit = jest.fn();
  const initialValues: FormValues = { certificate: "" };

  render(
    <FormProvider
      initialValues={initialValues}
      validationSchema={validationSchema}
      onSubmit={onSubmit}
    >
      <Form>
        <FormFileInput
          name="certificate"
          title="Certificate"
          encoding={encoding}
        />
        <FormSubmitButton />
      </Form>
    </FormProvider>,
  );

  return { onSubmit };
};

const uploadFile = (contents: string) =>
  userEvent.upload(
    screen.getByLabelText("Certificate file input"),
    new File([contents], "cert.pem", { type: "text/plain" }),
  );

const submit = () =>
  userEvent.click(screen.getByRole("button", { name: "Submit" }));

describe("FormFileInput", () => {
  it("says it takes a file before one is picked", () => {
    setup();

    expect(screen.getByText("Certificate")).toBeInTheDocument();
    expect(screen.getByText("Select a file")).toBeInTheDocument();
  });

  it("stores the file contents as text", async () => {
    const { onSubmit } = setup();

    await uploadFile("CERT");
    expect(screen.getByText("cert.pem")).toBeInTheDocument();
    await submit();

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        { certificate: "CERT" },
        expect.anything(),
      );
    });
  });

  it("announces a validation error after leaving the field empty", async () => {
    setup({
      validationSchema: Yup.object({
        certificate: Yup.string().required("required"),
      }),
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Certificate" })).toHaveFocus();
    await userEvent.tab();

    expect(await screen.findByRole("alert")).toHaveTextContent("required");
  });

  it("stores the file contents as a base64 data URL", async () => {
    const { onSubmit } = setup({ encoding: "base64" });

    await uploadFile("CERT");
    await submit();

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        { certificate: `data:text/plain;base64,${btoa("CERT")}` },
        expect.anything(),
      );
    });
  });
});
