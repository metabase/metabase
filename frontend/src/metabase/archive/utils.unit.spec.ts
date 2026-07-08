import {
  createMockCard,
  createMockCollectionItem,
  createMockDashboard,
} from "metabase-types/api/mocks";

import { getParentEntityLink } from "./utils";

describe("getParentEntityLink", () => {
  it("should generate collection link for collection question", () => {
    const updatedCollection = createMockCollectionItem({ archived: false });
    const link = getParentEntityLink(updatedCollection, undefined);
    expect(link).toBe("/collection/root");
  });

  it("should generate collection link for dashboards", () => {
    const updatedDashboard = createMockDashboard({ archived: false });
    const parentCollection = createMockCollectionItem({ id: 123 });
    const link = getParentEntityLink(updatedDashboard, parentCollection);
    expect(link).toBe("/collection/123-question");
  });

  it("should generate collection link for normal question", () => {
    const updatedQuestion = createMockCard({ archived: false });
    const link = getParentEntityLink(updatedQuestion, undefined);
    expect(link).toBe("/collection/root");
  });

  it("should generate collection link for dashboard question", () => {
    const updatedQuestion = createMockCard({
      archived: false,
      dashboard_id: 123,
    });
    const link = getParentEntityLink(updatedQuestion, undefined);
    expect(link).toBe("/dashboard/123");
  });
});
