import userEvent from "@testing-library/user-event";

import { findRequests } from "__support__/server-mocks";
import {
  setupStatefulChannelEndpoints,
  setupTestChannelEndpoint,
} from "__support__/server-mocks/channel";
import { renderWithProviders, screen, within } from "__support__/ui";
import type { NotificationChannel } from "metabase-types/api";
import { createMockChannel } from "metabase-types/api/mocks/channel";

import { WebhooksSettingsPage } from "./WebhooksSettingsPage";

const WEBHOOK_URL = "http://hooks.example.com/hooks/catch/";

interface SetupOpts {
  channels?: NotificationChannel[];
}

const setup = ({ channels = [] }: SetupOpts = {}) => {
  setupStatefulChannelEndpoints({ channels });
  setupTestChannelEndpoint();
  renderWithProviders(<WebhooksSettingsPage />);
};

const openCreateModal = async () => {
  await userEvent.click(
    await screen.findByRole("heading", { name: "Add a webhook" }),
  );
  return screen.findByRole("dialog");
};

const fillCommonFields = async (modal: HTMLElement) => {
  await userEvent.type(
    within(modal).getByLabelText("Webhook URL"),
    WEBHOOK_URL,
  );
  await userEvent.type(
    within(modal).getByLabelText("Give it a name"),
    "Awesome Hook",
  );
  await userEvent.type(
    within(modal).getByLabelText("Description"),
    "The best hook ever",
  );
};

const findRequestBodies = async ({
  method,
  path,
}: {
  method: "POST" | "PUT";
  path: string;
}): Promise<unknown[]> => {
  const requests = await findRequests(method);
  return requests
    .filter(({ url }) => new URL(url).pathname === path)
    .map(({ body }): unknown => body);
};

const AUTH_METHODS = [
  {
    radio: "Basic",
    feFormType: "basic",
    fillFields: async (modal: HTMLElement) => {
      await userEvent.type(
        within(modal).getByLabelText("Username"),
        "test@metabase.com",
      );
      await userEvent.type(
        within(modal).getByLabelText("Password"),
        "password",
      );
    },
    authInfo: { Authorization: "Basic dGVzdEBtZXRhYmFzZS5jb206cGFzc3dvcmQ=" },
  },
  {
    radio: "Bearer",
    feFormType: "bearer",
    fillFields: async (modal: HTMLElement) => {
      await userEvent.type(
        within(modal).getByLabelText("Bearer token"),
        "my-secret-token",
      );
    },
    authInfo: { Authorization: "Bearer my-secret-token" },
  },
  {
    radio: "API Key",
    feFormType: "api-key",
    fillFields: async (modal: HTMLElement) => {
      await userEvent.click(
        within(modal).getByRole("radio", { name: "Header" }),
      );
      await userEvent.type(within(modal).getByLabelText("Key"), "Mb_foo");
      await userEvent.type(within(modal).getByLabelText("Value"), "mb-bar");
    },
    authInfo: { Mb_foo: "mb-bar" },
  },
];

describe("WebhooksSettingsPage", () => {
  it.each(AUTH_METHODS)(
    "should send $radio auth in the header when testing and creating a webhook",
    async ({ radio, feFormType, fillFields, authInfo }) => {
      setup();
      const modal = await openCreateModal();
      await fillCommonFields(modal);
      await userEvent.click(within(modal).getByRole("radio", { name: radio }));
      await fillFields(modal);

      await userEvent.click(
        within(modal).getByRole("button", { name: "Send a test" }),
      );
      expect(
        await within(modal).findByRole("button", { name: "Success" }),
      ).toBeInTheDocument();

      await userEvent.click(
        within(modal).getByRole("button", { name: "Create destination" }),
      );
      expect(
        await screen.findByRole("heading", { name: "Awesome Hook" }),
      ).toBeInTheDocument();

      expect(
        await findRequestBodies({ method: "POST", path: "/api/channel/test" }),
      ).toEqual([
        {
          type: "channel/http",
          details: {
            url: WEBHOOK_URL,
            "auth-method": "header",
            "auth-info": authInfo,
          },
        },
      ]);
      expect(
        await findRequestBodies({ method: "POST", path: "/api/channel" }),
      ).toEqual([
        {
          name: "Awesome Hook",
          type: "channel/http",
          description: "The best hook ever",
          details: {
            url: WEBHOOK_URL,
            "fe-form-type": feFormType,
            "auth-method": "header",
            "auth-info": authInfo,
          },
        },
      ]);
    },
  );

  it("should show the webhook response when a test fails, and hide it after a successful test", async () => {
    setup();
    setupTestChannelEndpoint({
      errorData: {
        "request-status": 400,
        "request-body": "Missing required header",
      },
    });
    const modal = await openCreateModal();
    await fillCommonFields(modal);

    await userEvent.click(
      within(modal).getByRole("button", { name: "Send a test" }),
    );
    const response = await within(modal).findByTestId(
      "notification-test-response",
    );
    expect(within(modal).getByText("Test response")).toBeInTheDocument();
    expect(response).toHaveTextContent('"request-status": 400');
    expect(response).toHaveTextContent(
      '"request-body": "Missing required header"',
    );

    setupTestChannelEndpoint();
    await userEvent.click(
      await within(modal).findByRole("button", { name: "Send a test" }),
    );
    expect(
      await within(modal).findByRole("button", { name: "Success" }),
    ).toBeInTheDocument();
    expect(
      within(modal).queryByTestId("notification-test-response"),
    ).not.toBeInTheDocument();
    expect(within(modal).queryByText("Test response")).not.toBeInTheDocument();
  });

  it("should create a webhook and list it", async () => {
    setup();
    const modal = await openCreateModal();
    await fillCommonFields(modal);
    await userEvent.click(
      within(modal).getByRole("button", { name: "Create destination" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Awesome Hook" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add another/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Add a webhook" }),
    ).not.toBeInTheDocument();
  });

  it("should rename a webhook", async () => {
    setup({ channels: [createMockChannel({ id: 7, name: "Awesome Hook" })] });

    await userEvent.click(
      await screen.findByRole("heading", { name: "Awesome Hook" }),
    );
    const modal = await screen.findByRole("dialog");
    expect(
      within(modal).getByRole("heading", { name: "Edit this webhook" }),
    ).toBeInTheDocument();
    await userEvent.clear(within(modal).getByLabelText("Give it a name"));
    await userEvent.type(
      within(modal).getByLabelText("Give it a name"),
      "Updated Hook",
    );
    await userEvent.click(
      within(modal).getByRole("button", { name: "Save changes" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Updated Hook" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Awesome Hook" }),
    ).not.toBeInTheDocument();
    expect(
      await findRequestBodies({ method: "PUT", path: "/api/channel/7" }),
    ).toEqual([expect.objectContaining({ name: "Updated Hook" })]);
  });

  it("should delete a webhook and show the empty state", async () => {
    setup({ channels: [createMockChannel({ id: 7, name: "Awesome Hook" })] });

    await userEvent.click(
      await screen.findByRole("heading", { name: "Awesome Hook" }),
    );
    const modal = await screen.findByRole("dialog");
    await userEvent.click(
      within(modal).getByRole("button", { name: /Delete this destination/ }),
    );

    expect(
      await screen.findByRole("heading", { name: "Add a webhook" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Awesome Hook" }),
    ).not.toBeInTheDocument();
    expect(
      await findRequestBodies({ method: "PUT", path: "/api/channel/7" }),
    ).toEqual([{ active: false }]);
  });
});
