import {
  createMockCollection,
  createMockTable,
} from "metabase-types/api/mocks";

import { getPublishSeeItLink } from "./components/TablePicker/utils";

const createMockPublishTablesResponse = ({
  target_collection = createMockCollection({ type: "library-models" }),
  tables = [createMockTable()],
} = {}) => {
  return { target_collection, tables };
};

describe("getPublishSeeItLink", () => {
  describe("published inside data studio", () => {
    it("1 table published", () => {
      const response = createMockPublishTablesResponse();
      const link = getPublishSeeItLink(response);

      expect(link).toContain(`question`);
    });

    it("> 1 table published", () => {
      const response = createMockPublishTablesResponse({
        tables: [createMockTable({ id: 1 }), createMockTable({ id: 2 })],
      });
      const link = getPublishSeeItLink(response);

      expect(link).toContain(
        `data-studio/modeling/collections/${response.target_collection.id}`,
      );
    });
  });

  describe("published outside data studio", () => {
    it("1 table published", () => {
      const response = createMockPublishTablesResponse({
        target_collection: createMockCollection(),
      });
      const link = getPublishSeeItLink(response);

      expect(link).toContain(`question`);
    });

    it("> 1 table published", () => {
      const response = createMockPublishTablesResponse({
        tables: [createMockTable({ id: 1 }), createMockTable({ id: 2 })],
        target_collection: createMockCollection(),
      });
      const link = getPublishSeeItLink(response);

      expect(link).toContain(`collection/${response.target_collection.id}`);
    });
  });
});
