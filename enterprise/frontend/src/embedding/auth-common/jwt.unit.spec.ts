import fetchMock from "fetch-mock";

import { jwtDefaultRefreshTokenFunction } from "./jwt";

const INSTANCE_URL = "http://localhost:3000";

describe("jwtDefaultRefreshTokenFunction", () => {
  it("should include backend error message when token exchange fails", async () => {
    fetchMock.post(`${INSTANCE_URL}/auth/sso`, {
      status: 402,
      body: {
        status: "error-embedding-sdk-disabled",
        message: "Embedding SDK for React is disabled.",
      },
    });

    await expect(
      jwtDefaultRefreshTokenFunction(
        "http://localhost:8080/sso/metabase",
        INSTANCE_URL,
        {},
        async () => ({ jwt: "signed-token" }),
      ),
    ).rejects.toThrow(
      "status: 402, message: Embedding SDK for React is disabled.",
    );
  });
});
