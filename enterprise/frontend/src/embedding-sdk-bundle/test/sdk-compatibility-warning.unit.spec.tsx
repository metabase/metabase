import { render } from "@testing-library/react";

import {
  setupCurrentUserEndpoint,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { waitForLoaderToBeRemoved } from "__support__/ui";
import { MetabaseProvider } from "embedding-sdk-bundle/components/public";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
  createMockVersion,
} from "metabase-types/api/mocks";

import { getEmbeddingSdkVersion } from "../config";

import { createMockSdkConfig } from "./mocks/config";
import { setupMockJwtEndpoints } from "./mocks/sso";

const defaultAuthConfig = createMockSdkConfig();

jest.mock("../config", () => ({
  getEmbeddingSdkVersion: jest.fn(),
}));

const setup = async ({
  sdkVersion,
  mbVersion,
}: {
  sdkVersion: string;
  mbVersion: string;
}) => {
  (getEmbeddingSdkVersion as jest.Mock).mockReturnValue(sdkVersion);

  setupMockJwtEndpoints();
  setupPropertiesEndpoints(
    createMockSettings({
      "token-features": createMockTokenFeatures({
        embedding_sdk: true,
      }),
      version: createMockVersion({ tag: mbVersion }),
    }),
  );
  setupCurrentUserEndpoint(createMockUser({ id: 1 }));

  render(
    <MetabaseProvider authConfig={defaultAuthConfig}>
      <div>Hello</div>
    </MetabaseProvider>,
  );
  await waitForLoaderToBeRemoved();
};

let consoleWarnSpy: jest.SpyInstance;

const getWarnMessages = (): string[] =>
  consoleWarnSpy.mock.calls.map((callArguments) => callArguments.join(" "));

describe("SDK auth errors", () => {
  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    (getEmbeddingSdkVersion as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("SDK version compatibility", () => {
    it("should show a message when the SDK version is not compatible with the Metabase version", async () => {
      await setup({ sdkVersion: "0.52.10", mbVersion: "v1.55.0" });

      expect(
        getWarnMessages().filter((message) =>
          message.includes(
            "SDK version 0.52.10 is not compatible with MB version v1.55.0, this might cause issues.",
          ),
        ),
      ).toHaveLength(1);
    });

    it("should not show a warning when the SDK version is compatible with the Metabase version", async () => {
      await setup({ sdkVersion: "0.55.10", mbVersion: "v1.55.1" });

      expect(
        getWarnMessages().filter((message) =>
          message.includes("is not compatible"),
        ),
      ).toHaveLength(0);
    });

    it("should not show the warning when the sdk version is unknown", async () => {
      await setup({ sdkVersion: "unknown", mbVersion: "v1.55.1" });

      expect(
        getWarnMessages().filter((message) =>
          message.includes("is not compatible"),
        ),
      ).toHaveLength(0);
    });
  });
});
