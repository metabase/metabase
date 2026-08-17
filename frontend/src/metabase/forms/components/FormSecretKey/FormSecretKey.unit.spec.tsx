import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupGenerateRandomTokenEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { Form, FormProvider, FormSubmitButton } from "metabase/forms";

import { FormSecretKey } from "./FormSecretKey";

interface FormValues {
  secret: string | null | undefined;
}

interface SetupOpts {
  initialValues?: FormValues;
  readOnly?: boolean;
}

const GENERATED_TOKEN = "newly-generated-token-xyz";
const REGENERATED_TOKEN = "second-generated-token-def";
const EXISTING_VALUE = "my-super-secret-token-abc123";
// obfuscateValue shows "**********" + last 2 chars
const OBFUSCATED_EXISTING = "**********23";
const OBFUSCATED_GENERATED = "**********yz";

const setup = ({
  initialValues = { secret: undefined },
  readOnly = false,
}: SetupOpts = {}) => {
  const onSubmit = jest.fn();

  setupGenerateRandomTokenEndpoint(GENERATED_TOKEN);

  renderWithProviders(
    <FormProvider initialValues={initialValues} onSubmit={onSubmit}>
      <Form>
        <FormSecretKey
          name="secret"
          label="Signing Key"
          readOnly={readOnly}
          wrapperProps={{
            "data-testid": "inputWrapper",
          }}
        />
        <FormSubmitButton />
      </Form>
    </FormProvider>,
  );

  return { onSubmit };
};

const regenerateKey = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Regenerate key" }));
  await userEvent.click(screen.getByRole("button", { name: "Delete key" }));
  await screen.findByRole("dialog", { name: "Store your new key" });
};

describe("FormSecretKey", () => {
  afterEach(() => {
    fetchMock.hardReset();
  });

  describe("when there is no value", () => {
    it("shows a 'Set up key' button", () => {
      setup({ initialValues: { secret: undefined } });

      expect(
        screen.getByRole("button", { name: "Set up key" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Regenerate key" }),
      ).not.toBeInTheDocument();
    });

    it("generates a key and shows it read-only when 'Set up key' is clicked", async () => {
      setup({ initialValues: { secret: undefined } });

      expect(fetchMock.callHistory.calls("generate-random-token")).toHaveLength(
        0,
      );

      await userEvent.click(screen.getByRole("button", { name: "Set up key" }));

      const modal = await screen.findByRole("dialog", {
        name: "Create a secret key",
      });
      expect(fetchMock.callHistory.calls("generate-random-token")).toHaveLength(
        1,
      );

      const keyInput = within(modal).getByRole("textbox", {
        name: "New secret key",
      });
      await waitFor(() => expect(keyInput).toHaveValue(GENERATED_TOKEN));
      expect(keyInput).toHaveAttribute("readonly");
    });

    it("offers an icon-only copy button", async () => {
      setup({ initialValues: { secret: undefined } });

      await userEvent.click(screen.getByRole("button", { name: "Set up key" }));
      const modal = await screen.findByRole("dialog", {
        name: "Create a secret key",
      });

      const copyButton = await within(modal).findByRole("button", {
        name: "Copy",
      });
      expect(copyButton).toHaveTextContent("");
    });

    it("updates the form value after clicking 'Create'", async () => {
      setup({ initialValues: { secret: undefined } });

      await userEvent.click(screen.getByRole("button", { name: "Set up key" }));
      await screen.findByRole("dialog", { name: "Create a secret key" });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();
      });
      await userEvent.click(screen.getByRole("button", { name: "Create" }));

      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", { name: "Create a secret key" }),
        ).not.toBeInTheDocument();
      });

      expect(screen.getByLabelText("Signing Key")).toHaveValue(
        OBFUSCATED_GENERATED,
      );
      expect(
        screen.getByRole("button", { name: "Regenerate key" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Set up key" }),
      ).not.toBeInTheDocument();
    });

    it("does not show the previously generated key when reopened", async () => {
      setup({ initialValues: { secret: undefined } });

      await userEvent.click(screen.getByRole("button", { name: "Set up key" }));
      await screen.findByRole("dialog", { name: "Create a secret key" });
      await waitFor(() =>
        expect(
          screen.getByRole("textbox", { name: "New secret key" }),
        ).toHaveValue(GENERATED_TOKEN),
      );
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      fetchMock.modifyRoute("generate-random-token", {
        response: { token: REGENERATED_TOKEN },
      });
      await userEvent.click(screen.getByRole("button", { name: "Set up key" }));

      const keyInput = await screen.findByRole("textbox", {
        name: "New secret key",
      });
      expect(keyInput).not.toHaveValue(GENERATED_TOKEN);
      await waitFor(() => expect(keyInput).toHaveValue(REGENERATED_TOKEN));
    });

    it("does not update the value after clicking 'Cancel'", async () => {
      setup({ initialValues: { secret: undefined } });

      await userEvent.click(screen.getByRole("button", { name: "Set up key" }));
      await screen.findByRole("dialog", { name: "Create a secret key" });
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", { name: "Create a secret key" }),
        ).not.toBeInTheDocument();
      });

      expect(
        screen.getByRole("button", { name: "Set up key" }),
      ).toBeInTheDocument();
    });
  });

  describe("when there is an existing value", () => {
    it("shows a read-only text input with the obfuscated value", () => {
      setup({ initialValues: { secret: EXISTING_VALUE } });

      const input = screen.getByLabelText("Signing Key");
      expect(input).toHaveValue(OBFUSCATED_EXISTING);
      expect(input).toHaveAttribute("readonly");
    });

    it("shows 'Regenerate key' button, not 'Set up key'", () => {
      setup({ initialValues: { secret: EXISTING_VALUE } });

      expect(
        screen.getByRole("button", { name: "Regenerate key" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Set up key" }),
      ).not.toBeInTheDocument();
    });

    it("asks for confirmation before generating a new key", async () => {
      setup({ initialValues: { secret: EXISTING_VALUE } });

      await userEvent.click(
        within(screen.getByTestId("inputWrapper")).getByRole("button", {
          name: "Regenerate key",
        }),
      );

      expect(
        await screen.findByRole("dialog", {
          name: "Delete key and generate a new one?",
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/This will cause existing tokens to stop working/),
      ).toBeInTheDocument();
      expect(fetchMock.callHistory.calls("generate-random-token")).toHaveLength(
        0,
      );
    });

    it("keeps the current key when the confirmation is dismissed", async () => {
      setup({ initialValues: { secret: EXISTING_VALUE } });

      await userEvent.click(
        screen.getByRole("button", { name: "Regenerate key" }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "No, don't delete" }),
      );

      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", {
            name: "Delete key and generate a new one?",
          }),
        ).not.toBeInTheDocument();
      });
      expect(screen.getByLabelText("Signing Key")).toHaveValue(
        OBFUSCATED_EXISTING,
      );
    });

    it("replaces the key after confirming and clicking 'Done'", async () => {
      setup({ initialValues: { secret: EXISTING_VALUE } });

      await regenerateKey();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
      });
      await userEvent.click(screen.getByRole("button", { name: "Done" }));

      await waitFor(() => {
        expect(screen.getByLabelText("Signing Key")).toHaveValue(
          OBFUSCATED_GENERATED,
        );
      });
    });

    it("shows a freshly generated key, not the one from an earlier modal", async () => {
      setup({ initialValues: { secret: undefined } });

      await userEvent.click(screen.getByRole("button", { name: "Set up key" }));
      await waitFor(() =>
        expect(
          screen.getByRole("textbox", { name: "New secret key" }),
        ).toHaveValue(GENERATED_TOKEN),
      );
      await userEvent.click(screen.getByRole("button", { name: "Create" }));

      fetchMock.modifyRoute("generate-random-token", {
        response: { token: REGENERATED_TOKEN },
      });
      await regenerateKey();

      const keyInput = screen.getByRole("textbox", { name: "New secret key" });
      expect(keyInput).not.toHaveValue(GENERATED_TOKEN);
      await waitFor(() => expect(keyInput).toHaveValue(REGENERATED_TOKEN));
    });

    it("does not offer to cancel out of storing the new key", async () => {
      setup({ initialValues: { secret: EXISTING_VALUE } });

      await regenerateKey();

      expect(
        screen.queryByRole("button", { name: "Cancel" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("when readOnly is true (env var controlled)", () => {
    it("does not show 'Regenerate key' or 'Set up key' buttons", () => {
      setup({ initialValues: { secret: EXISTING_VALUE }, readOnly: true });
      expect(
        within(screen.getByTestId("inputWrapper")).queryByRole("button"),
      ).not.toBeInTheDocument();
    });
  });
});
