// Ensure the custom elements are registered
import "metabase/embedding/embedding-iframe-sdk/embed";
import type { MetabaseEmbedElement } from "metabase/embedding/embedding-iframe-sdk/embed";

import { createEmbeddedAnalyticsJsUsage } from "./analytics";
import type { SdkIframeEmbedBaseSettings } from "./types/embed";

const defineMetabaseConfig = (config: SdkIframeEmbedBaseSettings) => {
  (window as any).metabaseConfig = config;
};

describe("createEmbeddedAnalyticsJsUsage", () => {
  beforeEach(() => {
    // clean up window.metabaseConfig
    delete (window as any).metabaseConfig;
  });

  describe("Metabase configuration", () => {
    it('should capture "session" auth method', () => {
      defineMetabaseConfig({
        useExistingUserSession: true,
        instanceUrl: "https://example.com",
      });

      expect(
        createEmbeddedAnalyticsJsUsage(
          new Set([createEmbeddedAnalyticsJsElement("metabase-question")]),
        ),
      ).toEqual(
        expect.objectContaining({
          global: {
            auth_method: "session",
          },
        }),
      );
    });

    it('should capture "api_key" auth method', () => {
      defineMetabaseConfig({
        useExistingUserSession: false,
        apiKey: "blabla",
        instanceUrl: "https://example.com",
      });

      expect(
        createEmbeddedAnalyticsJsUsage(
          new Set([createEmbeddedAnalyticsJsElement("metabase-question")]),
        ),
      ).toEqual(
        expect.objectContaining({
          global: {
            auth_method: "api_key",
          },
        }),
      );
    });

    it('should capture "sso" auth method', () => {
      defineMetabaseConfig({
        instanceUrl: "https://example.com",
      });

      expect(
        createEmbeddedAnalyticsJsUsage(
          new Set([createEmbeddedAnalyticsJsElement("metabase-question")]),
        ),
      ).toEqual(
        expect.objectContaining({
          global: {
            auth_method: "sso",
          },
        }),
      );
    });

    it('should capture "guest" auth method', () => {
      defineMetabaseConfig({
        isGuest: true,
        instanceUrl: "https://example.com",
      });

      expect(
        createEmbeddedAnalyticsJsUsage(
          new Set([createEmbeddedAnalyticsJsElement("metabase-question")]),
        ),
      ).toEqual(
        expect.objectContaining({
          global: {
            auth_method: "guest",
          },
        }),
      );
    });
  });

  describe("Component usage", () => {
    describe("dashboard", () => {
      it("should count default values", () => {
        expect(
          createEmbeddedAnalyticsJsUsage(
            new Set([createEmbeddedAnalyticsJsElement("metabase-dashboard")]),
          ),
        ).toEqual(
          expect.objectContaining({
            dashboard: {
              drills: { true: 1, false: 0 },
              with_downloads: { true: 0, false: 1 },
              with_title: { true: 1, false: 0 },
              with_subscriptions: { true: 0, false: 1 },
            },
          }),
        );
      });

      it("should count properties correctly", () => {
        // Explicit default values
        expect(
          createEmbeddedAnalyticsJsUsage(
            new Set([
              createEmbeddedAnalyticsJsElement("metabase-dashboard", {
                drills: true,
                "with-downloads": false,
                "with-title": true,
                "with-subscriptions": false,
              }),
            ]),
          ),
        ).toEqual(
          expect.objectContaining({
            dashboard: {
              drills: { true: 1, false: 0 },
              with_downloads: { true: 0, false: 1 },
              with_title: { true: 1, false: 0 },
              with_subscriptions: { true: 0, false: 1 },
            },
          }),
        );

        // Flip the default values
        expect(
          createEmbeddedAnalyticsJsUsage(
            new Set([
              createEmbeddedAnalyticsJsElement("metabase-dashboard", {
                drills: false,
                "with-downloads": true,
                "with-title": false,
                "with-subscriptions": true,
              }),
            ]),
          ),
        ).toEqual(
          expect.objectContaining({
            dashboard: {
              drills: { true: 0, false: 1 },
              with_downloads: { true: 1, false: 0 },
              with_title: { true: 0, false: 1 },
              with_subscriptions: { true: 1, false: 0 },
            },
          }),
        );

        // Multiple components
        expect(
          createEmbeddedAnalyticsJsUsage(
            new Set([
              createEmbeddedAnalyticsJsElement("metabase-dashboard"),
              createEmbeddedAnalyticsJsElement("metabase-dashboard"),
              createEmbeddedAnalyticsJsElement("metabase-dashboard", {
                drills: false,
                "with-downloads": true,
                "with-title": false,
                "with-subscriptions": true,
              }),
            ]),
          ),
        ).toEqual(
          expect.objectContaining({
            dashboard: {
              drills: { true: 2, false: 1 },
              with_downloads: { true: 1, false: 2 },
              with_title: { true: 2, false: 1 },
              with_subscriptions: { true: 1, false: 2 },
            },
          }),
        );
      });
    });

    describe("question", () => {
      it("should count default values", () => {
        expect(
          createEmbeddedAnalyticsJsUsage(
            new Set([
              createEmbeddedAnalyticsJsElement("metabase-question", {
                "question-id": 1,
              }),
            ]),
          ),
        ).toEqual(
          expect.objectContaining({
            question: {
              drills: { true: 1, false: 0 },
              with_downloads: { true: 0, false: 1 },
              with_title: { true: 1, false: 0 },
              is_save_enabled: { true: 0, false: 1 },
              with_alerts: { true: 0, false: 1 },
            },
          }),
        );
      });

      it("should count properties correctly", () => {
        // Explicit default values
        expect(
          createEmbeddedAnalyticsJsUsage(
            new Set([
              createEmbeddedAnalyticsJsElement("metabase-question", {
                "question-id": 1,
                drills: true,
                "with-downloads": false,
                "with-title": true,
                "is-save-enabled": false,
                "with-alerts": false,
              }),
            ]),
          ),
        ).toEqual(
          expect.objectContaining({
            question: {
              drills: { true: 1, false: 0 },
              with_downloads: { true: 0, false: 1 },
              with_title: { true: 1, false: 0 },
              is_save_enabled: { true: 0, false: 1 },
              with_alerts: { true: 0, false: 1 },
            },
          }),
        );

        // Flip the default values
        expect(
          createEmbeddedAnalyticsJsUsage(
            new Set([
              createEmbeddedAnalyticsJsElement("metabase-question", {
                "question-id": 1,
                drills: false,
                "with-downloads": true,
                "with-title": false,
                "is-save-enabled": true,
                "with-alerts": true,
              }),
            ]),
          ),
        ).toEqual(
          expect.objectContaining({
            question: {
              drills: { true: 0, false: 1 },
              with_downloads: { true: 1, false: 0 },
              with_title: { true: 0, false: 1 },
              is_save_enabled: { true: 1, false: 0 },
              with_alerts: { true: 1, false: 0 },
            },
          }),
        );

        // Multiple components
        expect(
          createEmbeddedAnalyticsJsUsage(
            new Set([
              createEmbeddedAnalyticsJsElement("metabase-question"),
              createEmbeddedAnalyticsJsElement("metabase-question"),
              createEmbeddedAnalyticsJsElement("metabase-question", {
                drills: false,
                "with-downloads": true,
                "with-title": false,
                "is-save-enabled": true,
                "with-alerts": true,
              }),
            ]),
          ),
        ).toEqual(
          expect.objectContaining({
            question: {
              drills: { true: 2, false: 1 },
              with_downloads: { true: 1, false: 2 },
              with_title: { true: 2, false: 1 },
              is_save_enabled: { true: 1, false: 2 },
              with_alerts: { true: 1, false: 2 },
            },
          }),
        );
      });
    });

    describe("question with exploration", () => {
      it("should count default values", () => {
        expect(
          createEmbeddedAnalyticsJsUsage(
            new Set([
              createEmbeddedAnalyticsJsElement("metabase-question", {
                "question-id": "new",
              }),
            ]),
          ),
        ).toEqual(
          expect.objectContaining({
            exploration: {
              is_save_enabled: { true: 0, false: 1 },
            },
          }),
        );
      });

      it("should count question components with exploration", () => {
        // Explicit default values
        expect(
          createEmbeddedAnalyticsJsUsage(
            new Set([
              createEmbeddedAnalyticsJsElement("metabase-question", {
                "question-id": "new",
                "is-save-enabled": false,
              }),
            ]),
          ),
        ).toEqual(
          expect.objectContaining({
            exploration: {
              is_save_enabled: { true: 0, false: 1 },
            },
          }),
        );

        // Flip the default values
        expect(
          createEmbeddedAnalyticsJsUsage(
            new Set([
              createEmbeddedAnalyticsJsElement("metabase-question", {
                "question-id": "new",
                "is-save-enabled": true,
              }),
            ]),
          ),
        ).toEqual(
          expect.objectContaining({
            exploration: {
              is_save_enabled: { true: 1, false: 0 },
            },
          }),
        );

        // Multiple components
        expect(
          createEmbeddedAnalyticsJsUsage(
            new Set([
              createEmbeddedAnalyticsJsElement("metabase-question", {
                "question-id": "new",
              }),
              createEmbeddedAnalyticsJsElement("metabase-question", {
                "question-id": "new",
              }),
              createEmbeddedAnalyticsJsElement("metabase-question", {
                "question-id": "new",
                "is-save-enabled": true,
              }),
            ]),
          ),
        ).toEqual(
          expect.objectContaining({
            exploration: {
              is_save_enabled: { true: 1, false: 2 },
            },
          }),
        );
      });
    });

    describe("browser", () => {
      it("should count default values", () => {
        expect(
          createEmbeddedAnalyticsJsUsage(
            new Set([createEmbeddedAnalyticsJsElement("metabase-browser")]),
          ),
        ).toEqual(
          expect.objectContaining({
            browser: {
              read_only: { true: 1, false: 0 },
            },
          }),
        );
      });

      it("should count properties correctly", () => {
        // Explicit default values
        expect(
          createEmbeddedAnalyticsJsUsage(
            new Set([
              createEmbeddedAnalyticsJsElement("metabase-browser", {
                "read-only": true,
              }),
            ]),
          ),
        ).toEqual(
          expect.objectContaining({
            browser: {
              read_only: { true: 1, false: 0 },
            },
          }),
        );

        // Flip the default values
        expect(
          createEmbeddedAnalyticsJsUsage(
            new Set([
              createEmbeddedAnalyticsJsElement("metabase-browser", {
                "read-only": false,
              }),
            ]),
          ),
        ).toEqual(
          expect.objectContaining({
            browser: {
              read_only: { true: 0, false: 1 },
            },
          }),
        );

        // Multiple components
        expect(
          createEmbeddedAnalyticsJsUsage(
            new Set([
              createEmbeddedAnalyticsJsElement("metabase-browser"),
              createEmbeddedAnalyticsJsElement("metabase-browser"),
              createEmbeddedAnalyticsJsElement("metabase-browser", {
                "read-only": false,
              }),
            ]),
          ),
        ).toEqual(
          expect.objectContaining({
            browser: {
              read_only: { true: 2, false: 1 },
            },
          }),
        );
      });
    });
  });
});

type Component =
  | "metabase-dashboard"
  | "metabase-question"
  | "metabase-browser";
function createEmbeddedAnalyticsJsElement(
  componentName: Component,
  properties: Record<string, any> = {},
): MetabaseEmbedElement {
  const component = document.createElement(
    componentName,
  ) as MetabaseEmbedElement;
  Object.entries(properties).forEach(([key, value]) => {
    component.setAttribute(key, value);
  });

  return component;
}
