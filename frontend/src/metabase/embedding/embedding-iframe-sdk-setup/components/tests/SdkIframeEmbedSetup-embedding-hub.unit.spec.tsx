import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import { PLUGIN_EMBEDDING_IFRAME_SDK_SETUP } from "metabase/plugins";

import { setup, waitForUpdateSetting } from "./test-setup";

describe("Embed flow > embedding hub step completion tracking", () => {
  beforeEach(() => {
    PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.isEnabled = jest.fn(() => true);
  });

  afterEach(() => {
    PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.isEnabled = () => false;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    { useExistingUserSession: true, trigger: "copy" },
    { useExistingUserSession: false, trigger: "copy" },
    { useExistingUserSession: true, trigger: "done" },
    { useExistingUserSession: false, trigger: "done" },
  ])(
    "updates setting on $trigger with $authMethod",
    async ({ useExistingUserSession, trigger }) => {
      setup({
        jwtReady: !useExistingUserSession,
        simpleEmbeddingEnabled: true,
        showSimpleEmbedTerms: false,
        initialState: {
          useExistingUserSession,
        },
      });

      const authRadio = screen.getByDisplayValue("sso");
      await userEvent.click(authRadio);
      expect(authRadio).toBeChecked();

      await userEvent.click(screen.getByRole("button", { name: "Next" }));
      await userEvent.click(screen.getByRole("button", { name: "Next" }));
      await userEvent.click(screen.getByRole("button", { name: "Get code" }));

      const ssoTypeRadio = screen.getByDisplayValue(
        useExistingUserSession ? "user-session" : "sso",
      );
      await userEvent.click(ssoTypeRadio);
      expect(ssoTypeRadio).toBeChecked();

      const actionButton = screen.getByRole("button", {
        name: trigger === "copy" ? /Copy code/ : /Done/,
      });

      await userEvent.click(actionButton);

      const expectedSetting = !useExistingUserSession
        ? "embedding-hub-production-embed-snippet-created"
        : "embedding-hub-test-embed-snippet-created";

      const matchingRequest = await waitForUpdateSetting(expectedSetting, true);
      expect(matchingRequest).toBeDefined();
    },
  );
});
