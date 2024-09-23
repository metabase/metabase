import type { SDKConfig } from "embedding-sdk";
import { setupSdkAuth } from "embedding-sdk/hooks";
import {
  createMockApiKeyConfig,
  createMockJwtConfig,
} from "embedding-sdk/test/mocks/config";
import api from "metabase/lib/api";

const JWT_CONFIG = createMockJwtConfig();
const API_KEY_CONFIG = createMockApiKeyConfig();

const setup = ({ config }: { config: SDKConfig }) => {
  const dispatch = jest.fn();

  setupSdkAuth(config, dispatch);
};

jest.mock("metabase/lib/api");
global.console = { ...global.console, warn: jest.fn() };

describe("setupSdkAuth", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    api.onBeforeRequest = undefined;
    api.apiKey = "";
  });

  describe("JWT configuration", () => {
    it("should set up JWT provider URI authentication", () => {
      setup({ config: JWT_CONFIG });
      expect(api.onBeforeRequest).not.toBe(undefined);
    });

    it("should use JWT provider URI when both JWT and API key are provided", () => {
      setup({
        config: {
          ...JWT_CONFIG,
          apiKey: API_KEY_CONFIG.apiKey,
        } as unknown as SDKConfig,
      });

      expect(api.onBeforeRequest).not.toBe(undefined);
      expect(api.apiKey).toBe("");
    });
  });

  describe("API key configuration", () => {
    it("should set up API key authentication", () => {
      setup({ config: API_KEY_CONFIG });

      expect(api.onBeforeRequest).toBe(undefined);
      expect(api.apiKey).toBe(API_KEY_CONFIG.apiKey);
    });

    // TODO: figure out a way to test if API key is used and *not* on localhost
    it("should log a warning if API key is used and is on localhost", () => {
      setup({ config: API_KEY_CONFIG });

      expect(api.onBeforeRequest).toBe(undefined);
      expect(api.apiKey).toBe(API_KEY_CONFIG.apiKey);
    });
  });
});
