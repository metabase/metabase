import { createMockDocument } from "metabase-types/api/mocks";

import { isVizOptionBlockedForPublicDocument } from "./visualizationUtils";

describe("isVizOptionBlockedForPublicDocument", () => {
  it("blocks a custom visualization for a public document", () => {
    const document = createMockDocument({ public_uuid: "abc123" });

    expect(isVizOptionBlockedForPublicDocument(document, "custom:foo")).toBe(
      true,
    );
  });

  it("does not block a non-custom visualization for a public document", () => {
    const document = createMockDocument({ public_uuid: "abc123" });

    expect(isVizOptionBlockedForPublicDocument(document, "table")).toBe(false);
  });

  it("does not block a custom visualization for a non-public document", () => {
    const document = createMockDocument({ public_uuid: null });

    expect(isVizOptionBlockedForPublicDocument(document, "custom:foo")).toBe(
      false,
    );
  });

  it("does not block a custom visualization when there is no document", () => {
    expect(isVizOptionBlockedForPublicDocument(null, "custom:foo")).toBe(false);
  });
});
