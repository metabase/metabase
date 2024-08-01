import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { act, renderWithProviders, screen } from "__support__/ui";

import { WebhookForm } from "./WebhookForm";

const INITIAL_FORM_VALUES = {
  url: "",
  name: "",
  description: "",
  "auth-method": "none" as const,
  "auth-info": { "": "" },
};

const setup = ({
  onSubmit = jest.fn(),
  onCancel = jest.fn(),
  onDelete = jest.fn(),
  initialValues = INITIAL_FORM_VALUES,
} = {}) => {
  renderWithProviders(
    <WebhookForm
      onSubmit={onSubmit}
      onCancel={onCancel}
      onDelete={onDelete}
      initialValues={initialValues}
    />,
  );

  return {
    onSubmit,
  };
};

describe("WebhookForm", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("should error when an invalid url is given", async () => {
    setup();
    await userEvent.type(
      await screen.findByLabelText("Webhook URL"),
      "A-bad-url{tab}",
    );
    expect(
      await screen.findByText("Please enter a correctly formatted URL"),
    ).toBeInTheDocument();
  });

  it("should error when no name is provided", async () => {
    setup();
    await userEvent.type(
      await screen.findByLabelText("Give it a name"),
      "{tab}",
    );
    expect(await screen.findByText("Please add a name")).toBeInTheDocument();
  });

  it("should error when no description is provided", async () => {
    setup();
    await userEvent.type(await screen.findByLabelText("Description"), "{tab}");
    expect(
      await screen.findByText("Please add a description"),
    ).toBeInTheDocument();
  });

  it("should show auth info when an authentication method is selected", async () => {
    setup();
    await userEvent.click(
      await screen.findByRole("radio", { name: "HTTP headers" }),
    );
    expect(await screen.findByText("Auth info")).toBeInTheDocument();
    expect(await screen.findByPlaceholderText("Key")).toBeInTheDocument();
    expect(await screen.findByPlaceholderText("Value")).toBeInTheDocument();
  });

  it("should allow you to submit a form when it is complete", async () => {
    const { onSubmit } = setup();
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
    await userEvent.click(
      await screen.findByRole("radio", { name: "Url params" }),
    );

    await userEvent.type(await screen.findByPlaceholderText("Key"), "token");
    await userEvent.type(
      await screen.findByPlaceholderText("Value"),
      "ItsASecret",
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Create destination" }),
    );

    expect(onSubmit).toHaveBeenCalledWith(
      {
        name: "The best hook",
        description: "Really though, it's the best",
        url: "http://my-awesome-hook.com/",
        "auth-method": "query-param",
        "auth-info": {
          token: "ItsASecret",
        },
      },
      expect.anything(),
    );
  });

  it("should allow you to test a connection", async () => {
    jest.useFakeTimers({
      advanceTimers: true,
    });
    fetchMock.post("path:/api/channel/test", async (_url, opts) => {
      const body = JSON.parse((await opts.body) as string);
      return body.details.url?.endsWith("good") ? { ok: true } : 400;
    });
    setup();

    await userEvent.type(
      screen.getByLabelText("Webhook URL"),
      "http://my-awesome-hook.com/bad",
    );

    await userEvent.click(screen.getByRole("button", { name: "Send a test" }));

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(await screen.findByText("Test failed")).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(4000));

    expect(screen.getByText("Send a test")).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Webhook URL"));
    await userEvent.type(
      screen.getByLabelText("Webhook URL"),
      "http://my-awesome-hook.com/good",
    );

    await userEvent.click(screen.getByRole("button", { name: "Send a test" }));
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(await screen.findByText("Success")).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(4000));
    expect(screen.getByText("Send a test")).toBeInTheDocument();
  });
});
