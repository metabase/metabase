import { screen } from "__support__/ui";
import {
  setupMockJwtEndpoints,
  setupMockSamlEndpoints,
} from "embedding-sdk-bundle/test/mocks/sso";

import { type MetabaseConfigProps, setup } from "./setup";

const setupCommon = (method: "jwt" | "saml", config?: MetabaseConfigProps) => {
  if (method === "jwt") {
    setupMockJwtEndpoints();
  } else if (method === "saml") {
    setupMockSamlEndpoints();
  }
  setup(config);
};

describe.each(["jwt"] as const)("useInitData - %s authentication", (method) => {
  it("should set isLoggedIn to true if login is successful", async () => {
    setupCommon(method);

    expect(await screen.findByTestId("test-component")).toHaveAttribute(
      "data-is-logged-in",
      "true",
    );

    expect(screen.getByTestId("test-component")).toHaveAttribute(
      "data-login-status",
      "success",
    );
  });

  it("should provide a useful error if the SDK instance can't be found", async () => {
    setupCommon(method, {
      metabaseInstanceUrl: "http://oisin-is-really-cool",
    });

    expect(await screen.findByTestId("test-component")).toHaveAttribute(
      "data-login-status",
      "error",
    );

    expect(screen.getByTestId("test-component")).toHaveAttribute(
      "data-error-message",
      "Unable to connect to instance at http://oisin-is-really-cool (status: 500)",
    );
  });

  it("start loading data if instance URL and auth type are valid", async () => {
    setupCommon(method);
    expect(screen.getByTestId("test-component")).toHaveAttribute(
      "data-login-status",
      "loading",
    );
  });
});
