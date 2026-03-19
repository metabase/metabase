import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { Form, FormProvider, FormSubmitButton } from "metabase/forms";

import { FormSecretKey } from "./FormSecretKey";

interface FormValues {
  secret: string | null | undefined;
}

interface SetupOpts {
  initialValues?: FormValues;
}

const CONFIRMATION = {
  header: "Regenerate signing key?",
  dialog: "Existing tokens will stop working.",
};

const OBFUSCATED_VALUE = "**********ab";
const PLAINTEXT_VALUE = "my-super-secret-token-abc123";

const setup = ({ initialValues = { secret: undefined } }: SetupOpts = {}) => {
  const onSubmit = jest.fn();

  fetchMock.get("path:/api/util/random_token", {
    token: "newly-generated-token",
  });

  renderWithProviders(
    <FormProvider initialValues={initialValues} onSubmit={onSubmit}>
      <Form>
        <FormSecretKey
          name="secret"
          label="Signing Key"
          confirmation={CONFIRMATION}
        />
        <FormSubmitButton />
      </Form>
    </FormProvider>,
  );

  return { onSubmit };
};

describe("FormSecretKey", () => {
  afterEach(() => {
    fetchMock.hardReset();
  });

  describe("when there is no value (UXW-3300)", () => {
    it("shows a 'Generate key' button and an empty password input", () => {
      setup({ initialValues: { secret: undefined } });

      expect(
        screen.getByRole("button", { name: "Generate key" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Regenerate key" }),
      ).not.toBeInTheDocument();
      const input = screen.getByLabelText("Signing Key");
      expect(input).toHaveValue("");
      expect(input).toHaveAttribute("type", "password");
    });

    it("generates a token and shows 'Regenerate key' after clicking 'Generate key' (UXW-3300)", async () => {
      setup({ initialValues: { secret: undefined } });

      await userEvent.click(
        screen.getByRole("button", { name: "Generate key" }),
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Regenerate key" }),
        ).toBeInTheDocument();
      });
      expect(
        screen.queryByRole("button", { name: "Generate key" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("when the value is a plaintext token (UXW-3300)", () => {
    it("shows 'Regenerate key' button and a password input (with eye toggle)", () => {
      setup({ initialValues: { secret: PLAINTEXT_VALUE } });

      expect(
        screen.getByRole("button", { name: "Regenerate key" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Generate key" }),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText("Signing Key")).toHaveAttribute(
        "type",
        "password",
      );
    });

    it("opens a confirmation modal when 'Regenerate key' is clicked (UXW-3300)", async () => {
      setup({ initialValues: { secret: PLAINTEXT_VALUE } });

      await userEvent.click(
        screen.getByRole("button", { name: "Regenerate key" }),
      );

      expect(await screen.findByText(CONFIRMATION.header)).toBeInTheDocument();
      expect(screen.getByText(CONFIRMATION.dialog)).toBeInTheDocument();
    });
  });

  describe("when the value is an obfuscated backend secret (UXW-3300)", () => {
    it("renders a disabled plain-text input showing the obfuscated value (no eye toggle)", () => {
      setup({ initialValues: { secret: OBFUSCATED_VALUE } });

      const input = screen.getByLabelText("Signing Key");
      expect(input).toHaveValue(OBFUSCATED_VALUE);
      expect(input).toHaveAttribute("readonly");
      // TextInput (not PasswordInput) — no type="password", no eye-toggle button
      expect(input).not.toHaveAttribute("type", "password");
    });

    it("shows 'Regenerate key' button, not 'Generate key'", () => {
      setup({ initialValues: { secret: OBFUSCATED_VALUE } });

      expect(
        screen.getByRole("button", { name: "Regenerate key" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Generate key" }),
      ).not.toBeInTheDocument();
    });

    it("opens a confirmation modal when 'Regenerate key' is clicked (UXW-3300)", async () => {
      setup({ initialValues: { secret: OBFUSCATED_VALUE } });

      await userEvent.click(
        screen.getByRole("button", { name: "Regenerate key" }),
      );

      expect(await screen.findByText(CONFIRMATION.header)).toBeInTheDocument();
      expect(screen.getByText(CONFIRMATION.dialog)).toBeInTheDocument();
    });

    it("switches to an enabled password input with the new token after confirming (UXW-3300)", async () => {
      setup({ initialValues: { secret: OBFUSCATED_VALUE } });

      await userEvent.click(
        screen.getByRole("button", { name: "Regenerate key" }),
      );
      await screen.findByText(CONFIRMATION.header);
      await userEvent.click(screen.getByRole("button", { name: "Yes" }));

      // Modal should close
      await waitFor(() => {
        expect(screen.queryByText(CONFIRMATION.header)).not.toBeInTheDocument();
      });

      // Input is now an enabled password field with the freshly generated token
      await waitFor(() => {
        const input = screen.getByLabelText("Signing Key");
        expect(input).not.toHaveAttribute("readonly");
        expect(input).toHaveAttribute("type", "password");
      });
      expect(
        screen.getByRole("button", { name: "Regenerate key" }),
      ).toBeInTheDocument();
    });
  });
});
