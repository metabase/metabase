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

    it("opens the setup modal when 'Set up key' is clicked", async () => {
      setup({ initialValues: { secret: undefined } });

      await userEvent.click(screen.getByRole("button", { name: "Set up key" }));

      expect(
        await screen.findByRole("dialog", { name: "Set up secret key" }),
      ).toBeInTheDocument();
    });

    it("auto-generates a token when the modal opens", async () => {
      setup({ initialValues: { secret: undefined } });

      expect(fetchMock.callHistory.calls("generate-random-token")).toHaveLength(
        0,
      );

      await userEvent.click(screen.getByRole("button", { name: "Set up key" }));

      expect(fetchMock.callHistory.calls("generate-random-token")).toHaveLength(
        1,
      );

      // The modal's text input should contain the generated token
      await waitFor(() => {
        const modalInput = within(screen.getByRole("dialog")).getByRole(
          "textbox",
          { name: "New secret key" },
        );
        expect(modalInput).toHaveValue(GENERATED_TOKEN);
      });
    });

    it("closes the modal and updates the form value after clicking 'Done'", async () => {
      setup({ initialValues: { secret: undefined } });

      await userEvent.click(screen.getByRole("button", { name: "Set up key" }));
      await screen.findByRole("dialog", { name: "Set up secret key" });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
      });

      await userEvent.click(screen.getByRole("button", { name: "Done" }));

      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", { name: "Set up secret key" }),
        ).not.toBeInTheDocument();
      });

      // The input shows the obfuscated generated value
      await waitFor(() => {
        expect(screen.getByLabelText("Signing Key")).toHaveValue(
          OBFUSCATED_GENERATED,
        );
      });

      // Button switches to "Regenerate key"
      expect(
        screen.getByRole("button", { name: "Regenerate key" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Set up key" }),
      ).not.toBeInTheDocument();
    });

    it("closes the modal without updating the value after clicking 'Cancel'", async () => {
      setup({ initialValues: { secret: undefined } });

      await userEvent.click(screen.getByRole("button", { name: "Set up key" }));
      await screen.findByRole("dialog", { name: "Set up secret key" });
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", { name: "Set up secret key" }),
        ).not.toBeInTheDocument();
      });

      // Still shows "Set up key" — value was not changed
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

    it("opens the setup modal when 'Regenerate key' is clicked", async () => {
      setup({ initialValues: { secret: EXISTING_VALUE } });

      await userEvent.click(
        within(screen.getByTestId("inputWrapper")).getByRole("button", {
          name: "Regenerate key",
        }),
      );

      expect(
        await screen.findByRole("dialog", { name: "Set up secret key" }),
      ).toBeInTheDocument();
    });

    it("shows a warning about existing tokens being invalidated when regenerating", async () => {
      setup({ initialValues: { secret: EXISTING_VALUE } });

      await userEvent.click(
        screen.getByRole("button", { name: "Regenerate key" }),
      );

      expect(
        await screen.findByText(
          /This will cause existing tokens to stop working/,
        ),
      ).toBeInTheDocument();
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

  describe("token length validation", () => {
    it("disables 'Done' button when the token is too short", async () => {
      setup({ initialValues: { secret: undefined } });

      await userEvent.click(screen.getByRole("button", { name: "Set up key" }));
      const input = screen.getByRole("textbox", { name: "New secret key" });

      await userEvent.clear(input);
      await userEvent.type(input, "1234");
      // Token is too short, so 'Done' button should be disabled
      expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();

      await userEvent.clear(input);
      await userEvent.type(input, "12345678");
      expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
    });
  });
});
