import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";

import { WebhookForm } from "./WebhookForm";

const INITIAL_FORM_VALUES = {
  url: "",
  name: "",
  description: "",
  "fe-form-type": "none" as const,
  "auth-method": "none" as const,
};

const setup = async ({
  onSubmit = jest.fn(),
  onCancel = jest.fn(),
  onDelete = jest.fn(),
  initialValues = INITIAL_FORM_VALUES,
  populateForm = false,
} = {}) => {
  renderWithProviders(
    <WebhookForm
      onSubmit={onSubmit}
      onCancel={onCancel}
      onDelete={onDelete}
      initialValues={initialValues}
    />,
  );

  if (populateForm) {
    await userEvent.type(
      await screen.findByLabelText("Webhook URL"),
      "http://my-awesome-hook.com/",
    );
    await userEvent.type(
      await screen.findByLabelText("Give it a name"),
      "The best hook",
    );
    await userEvent.type(
      await screen.findByLabelText("Description"),
      "Really though, it's the best",
    );
  }

  return {
    onSubmit,
  };
};

describe("WebhookForm", () => {
  it("should error when an invalid url is given", async () => {
    await setup();
    await userEvent.type(
      await screen.findByLabelText("Webhook URL"),
      "A-bad-url{tab}",
    );
    expect(
      await screen.findByText("Please enter a correctly formatted URL"),
    ).toBeInTheDocument();
  });

  it("should error when no name is provided", async () => {
    await setup();
    await userEvent.type(
      await screen.findByLabelText("Give it a name"),
      "{tab}",
    );
    expect(await screen.findByText("Please add a name")).toBeInTheDocument();
  });

  it("should error when no description is provided", async () => {
    await setup();
    await userEvent.type(await screen.findByLabelText("Description"), "{tab}");
    expect(
      await screen.findByText("Please add a description"),
    ).toBeInTheDocument();
  });

  it("should show a username and password field when basic auth is selected", async () => {
    const { onSubmit } = await setup({ populateForm: true });

    await userEvent.click(await screen.findByRole("radio", { name: "Basic" }));

    await userEvent.type(
      await screen.findByLabelText("Username"),
      "foo@bar.com",
    );
    await userEvent.type(await screen.findByLabelText("Password"), "pass");

    await userEvent.click(
      await screen.findByRole("button", { name: "Create destination" }),
    );

    expect(onSubmit).toHaveBeenCalledWith(
      {
        name: "The best hook",
        description: "Really though, it's the best",
        url: "http://my-awesome-hook.com/",
        "auth-method": "header",
        "fe-form-type": "basic",
        "auth-username": "foo@bar.com",
        "auth-password": "pass",
      },
      expect.anything(),
    );
  });

  it("should show a token field when bearer auth is selected", async () => {
    const { onSubmit } = await setup({ populateForm: true });

    await userEvent.click(await screen.findByRole("radio", { name: "Bearer" }));

    await userEvent.type(
      await screen.findByLabelText("Bearer token"),
      "SecretToken",
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Create destination" }),
    );

    expect(onSubmit).toHaveBeenCalledWith(
      {
        name: "The best hook",
        description: "Really though, it's the best",
        url: "http://my-awesome-hook.com/",
        "auth-method": "header",
        "fe-form-type": "bearer",
        "auth-info-value": "SecretToken",
      },
      expect.anything(),
    );
  });

  it("should show a allow you to add a key/value pair to header or query param", async () => {
    const { onSubmit } = await setup({ populateForm: true });

    await userEvent.click(
      await screen.findByRole("radio", { name: "API Key" }),
    );
    await userEvent.click(
      await screen.findByRole("radio", { name: "Query param" }),
    );

    await userEvent.type(await screen.findByLabelText("Key"), "Foo");

    await userEvent.type(await screen.findByLabelText("Value"), "Bar");

    await userEvent.click(
      await screen.findByRole("button", { name: "Create destination" }),
    );

    expect(onSubmit).toHaveBeenCalledWith(
      {
        name: "The best hook",
        description: "Really though, it's the best",
        url: "http://my-awesome-hook.com/",
        "auth-method": "query-param",
        "fe-form-type": "api-key",
        "auth-info-key": "Foo",
        "auth-info-value": "Bar",
      },
      expect.anything(),
    );
  });

  it("should allow you to test a connection", async () => {
    fetchMock.post("path:/api/channel/test", (call) => {
      const body = JSON.parse(call.options?.body as string);
      return body.details.url?.endsWith("good") ? { ok: true } : 400;
    });

    await setup();

    await userEvent.type(
      screen.getByLabelText("Webhook URL"),
      "http://my-awesome-hook.com/bad",
    );

    await userEvent.click(screen.getByRole("button", { name: "Send a test" }));

    // Wait for the test result to appear
    expect(
      await screen.findByRole("button", { name: "Test failed" }),
    ).toBeInTheDocument();

    // Wait for the button to reset (3 second timeout in the hook)
    expect(
      await screen.findByRole(
        "button",
        { name: "Send a test" },
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Webhook URL"));
    await userEvent.type(
      screen.getByLabelText("Webhook URL"),
      "http://my-awesome-hook.com/good",
    );

    await userEvent.click(screen.getByRole("button", { name: "Send a test" }));

    // Wait for success message
    expect(
      await screen.findByRole("button", { name: "Success" }),
    ).toBeInTheDocument();

    // Wait for button to reset (3 second timeout in the hook)
    expect(
      await screen.findByRole(
        "button",
        { name: "Send a test" },
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
  }, 15000);
});
