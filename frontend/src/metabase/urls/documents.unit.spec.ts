import { mockSettings } from "__support__/settings";

import {
  document,
  documentWithAnchor,
  newDocument,
  publicDocument,
} from "./documents";

describe("urls > documents", () => {
  describe("newDocument", () => {
    it("returns the new document URL", () => {
      expect(newDocument()).toBe("/document/new");
    });
  });

  describe("document", () => {
    it("returns document URL with id", () => {
      expect(document({ id: 123 })).toBe("/document/123");
    });
  });

  describe("publicDocument", () => {
    it("returns full public document URL with site-url", () => {
      mockSettings({ "site-url": "https://metabase.example.com" });

      expect(publicDocument("abc-123-uuid")).toBe(
        "https://metabase.example.com/public/document/abc-123-uuid",
      );
    });
  });

  describe("documentWithAnchor", () => {
    it("returns full document URL with anchor hash", () => {
      mockSettings({ "site-url": "https://metabase.example.com" });

      expect(documentWithAnchor({ id: 456 }, "block-abc-123")).toBe(
        "https://metabase.example.com/document/456#block-abc-123",
      );
    });

    it("handles numeric document id", () => {
      mockSettings({ "site-url": "http://localhost:3000" });

      expect(documentWithAnchor({ id: 1 }, "heading-1")).toBe(
        "http://localhost:3000/document/1#heading-1",
      );
    });

    it("handles block ids with special characters", () => {
      mockSettings({ "site-url": "https://example.com" });

      expect(documentWithAnchor({ id: 42 }, "uuid-a1b2c3d4-e5f6")).toBe(
        "https://example.com/document/42#uuid-a1b2c3d4-e5f6",
      );
    });
  });
});
