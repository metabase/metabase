import {
  createMockChannel,
  createMockChannelDetails,
} from "metabase-types/api/mocks/channel";

import type { WebhookFormProps } from "./WebhookForm";
import { buildAuthInfo, channelToForm } from "./utils";

const MockWebhookForm = (
  opts: Partial<WebhookFormProps> & Pick<WebhookFormProps, "fe-form-type">,
): WebhookFormProps => ({
  url: "metabase.com",
  name: "test",
  description: "desc",
  "auth-method": "header",
  ...opts,
});

describe("Notification Utils", () => {
  describe("buildAuthInfo", () => {
    it("should handle basic auth forms", () => {
      const authInfo = buildAuthInfo(
        MockWebhookForm({
          "fe-form-type": "basic",
          "auth-username": "user",
          "auth-password": "pass",
        }),
      );
      expect(authInfo).toHaveProperty(
        "Authorization",
        `Basic ${btoa("user:pass")}`,
      );
    });

    it("should handle bearer auth forms", () => {
      const authInfo = buildAuthInfo(
        MockWebhookForm({
          "fe-form-type": "bearer",
          "auth-info-value": "MyToken",
        }),
      );
      expect(authInfo).toHaveProperty("Authorization", "Bearer MyToken");
    });

    it("should handle api-key forms", () => {
      const authInfo = buildAuthInfo(
        MockWebhookForm({
          "fe-form-type": "api-key",
          "auth-info-key": "key",
          "auth-info-value": "token",
        }),
      );
      expect(authInfo).toHaveProperty("key", "token");
    });
  });

  describe("channelToForm", () => {
    it("should handle basic form type", () => {
      const formProps = channelToForm(
        createMockChannel({
          details: createMockChannelDetails({
            "fe-form-type": "basic",
            "auth-info": { Authorization: `Basic ${btoa("user:pass")}` },
          }),
        }),
      );
      expect(formProps).toHaveProperty("auth-username", "user");
      expect(formProps).toHaveProperty("auth-password", "pass");
    });

    it("should handle bearer form type", () => {
      const formProps = channelToForm(
        createMockChannel({
          details: createMockChannelDetails({
            "fe-form-type": "bearer",
            "auth-info": { Authorization: `Bearer MyToken` },
          }),
        }),
      );
      expect(formProps).toHaveProperty("auth-info-value", "MyToken");
    });

    it("should handle api-key form type", () => {
      const formProps = channelToForm(
        createMockChannel({
          details: createMockChannelDetails({
            "fe-form-type": "api-key",
            "auth-info": { "x-auth-token": "NobodyWillGuessThis" },
          }),
        }),
      );
      expect(formProps).toHaveProperty(
        "auth-info-value",
        "NobodyWillGuessThis",
      );
      expect(formProps).toHaveProperty("auth-info-key", "x-auth-token");
    });
  });
});
