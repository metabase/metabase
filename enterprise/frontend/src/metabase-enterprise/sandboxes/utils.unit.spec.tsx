import type { StructuredUserAttributes } from "metabase-types/api";
import { createMockTenant } from "metabase-types/api/mocks";

import { getExtraAttributes } from "./utils";

describe("getExtraAttributes", () => {
  it("synthesizes @tenant.slug as a system-defined, frozen attribute for new tenant users", () => {
    const tenant = createMockTenant({ slug: "ten01", attributes: {} });

    const attributes = getExtraAttributes(undefined, tenant);

    // must match what the backend returns for existing users so the
    // "This attribute is system defined" tooltip shows on the create form too
    expect(attributes?.["@tenant.slug"]).toEqual({
      value: "ten01",
      source: "system",
      frozen: true,
    });
  });

  it("synthesizes custom tenant attributes as overridable tenant attributes", () => {
    const tenant = createMockTenant({
      slug: "ten01",
      attributes: { region: "emea" },
    });

    const attributes = getExtraAttributes(undefined, tenant);

    expect(attributes?.region).toEqual({
      value: "emea",
      source: "tenant",
      frozen: false,
    });
  });

  it("returns existing structured attributes untouched when the slug is already present", () => {
    const tenant = createMockTenant({ slug: "ten01" });
    const structuredAttributes: StructuredUserAttributes = {
      "@tenant.slug": { value: "ten01", source: "system", frozen: true },
    };

    expect(getExtraAttributes(structuredAttributes, tenant)).toBe(
      structuredAttributes,
    );
  });

  it("returns structured attributes unchanged when there is no tenant", () => {
    const structuredAttributes: StructuredUserAttributes = {
      region: { value: "emea", source: "tenant", frozen: false },
    };

    expect(getExtraAttributes(structuredAttributes, undefined)).toBe(
      structuredAttributes,
    );
  });
});
