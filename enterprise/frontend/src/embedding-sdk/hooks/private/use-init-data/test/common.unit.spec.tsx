import fetchMock from "fetch-mock";

import { screen } from "__support__/ui";
import {
  setupMockJwtEndpoints,
  setupMockSamlEndpoints,
} from "embedding-sdk/test/mocks/sso";

import { type MetabaseConfigProps, setup } from "./setup";

const setupCommon = (method: "jwt" | "saml", config?: MetabaseConfigProps) => {
  if (method === "jwt") {
    setupMockJwtEndpoints();
  } else if (method === "saml") {
    setupMockSamlEndpoints();
  }
  setup(config);
};

describe.each(["jwt", "saml"] as const)(
  "useInitData - %s authentication",
  (method) => {
    afterEach(() => {
      jest.restoreAllMocks();
      fetchMock.restore();
    });

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

    it("raises an error for invalid preferredAuthMethod", async () => {
      expect(() =>
        setupCommon(method, {
          preferredAuthMethod: "invalid" as any,
        }),
      ).toThrow(/Invalid authentication method/);
    });
  },
);

describe("useInitData - preferred authentication method", () => {
  it("should handle when both auths are available", async () => {
    setupMockJwtEndpoints();
    setupMockSamlEndpoints();
    setup({ preferredAuthMethod: "jwt" });
    expect(await screen.findByTestId("test-component")).toBeInTheDocument();
  });

  it("should handle when no auths are available", async () => {
    fetchMock.get("/auth/sso", 404);
    setup({ preferredAuthMethod: "jwt" });
    expect(await screen.findByTestId("test-component")).toHaveAttribute(
      "data-login-status",
      "error",
    );
  });
});
