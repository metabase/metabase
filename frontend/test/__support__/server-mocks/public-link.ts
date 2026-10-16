import fetchMock from "fetch-mock";

import type { PublicLinkRefusal } from "metabase-types/api";

/**
 * Mock the question, dashboard or document refusal endpoint the sharing surfaces ask before
 * offering a public link.
 */
const setupPublicLinkRefusalEndpoint =
  (path: string) =>
  (
    id: string | number,
    refusal: PublicLinkRefusal = { refusing_database: null },
  ) => {
    fetchMock.get(`path:/api/${path}/${id}/public-link-refusal`, refusal);
  };

export const setupCardPublicLinkRefusalEndpoint =
  setupPublicLinkRefusalEndpoint("card");

export const setupDashboardPublicLinkRefusalEndpoint =
  setupPublicLinkRefusalEndpoint("dashboard");

export const setupDocumentPublicLinkRefusalEndpoint =
  setupPublicLinkRefusalEndpoint("document");
