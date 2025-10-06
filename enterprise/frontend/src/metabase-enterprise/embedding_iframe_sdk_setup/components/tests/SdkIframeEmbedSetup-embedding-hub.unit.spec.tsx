import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

import { setup, waitForUpdateSetting } from "./test-setup";

const mockLocation = (search: string) =>
  jest.mock("react-use", () => ({ useLocation: jest.fn(() => ({ search })) }));

describe("Embed flow > embedding hub step completion tracking", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    { authMethod: "user_session", trigger: "copy" },
    { authMethod: "sso", trigger: "copy" },
    { authMethod: "user_session", trigger: "done" },
    { authMethod: "sso", trigger: "done" },
  ])(
    "updates setting on $trigger with $authMethod",
    async ({ authMethod, trigger }) => {
      mockLocation(`auth_method=${authMethod}`);
      setup({
        jwtReady: authMethod === "sso",
        simpleEmbeddingEnabled: true,
      });

      await userEvent.click(screen.getByRole("button", { name: "Next" }));
      await userEvent.click(screen.getByRole("button", { name: "Next" }));
      await userEvent.click(screen.getByRole("button", { name: "Get code" }));

      const authRadio = screen.getByDisplayValue(
        authMethod === "user_session" ? "user-session" : "sso",
      );

      await userEvent.click(authRadio);
      expect(authRadio).toBeChecked();

      const actionButton = screen.getByRole("button", {
        name: trigger === "copy" ? /Copy code/ : /Done/,
      });

      await userEvent.click(actionButton);

      const expectedSetting =
        authMethod === "sso"
          ? "embedding-hub-production-embed-snippet-created"
          : "embedding-hub-test-embed-snippet-created";

      const matchingRequest = await waitForUpdateSetting(expectedSetting, true);
      expect(matchingRequest).toBeDefined();
    },
  );
});
