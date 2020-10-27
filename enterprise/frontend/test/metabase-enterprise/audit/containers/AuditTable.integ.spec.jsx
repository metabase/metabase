import React from "react";
import mock from "xhr-mock";
import { mountWithStore } from "__support__/integration";

import AuditTable from "metabase-enterprise/audit_app/containers/AuditTable";
import { delay } from "metabase/lib/promise";

const TABLE = {
  card: {
    name: "Query details",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit.pages.query-detail/details",
      args: ["asdf"],
    },
  },
};

describe("AuditTable", () => {
  beforeEach(() => mock.setup());
  afterEach(() => mock.teardown());

  describe("pagination controls", () => {
    beforeEach(() => {});
    it("should not appear if there's not another page", async () => {
      mock.post("/api/dataset", (req, res) =>
        res.json({
          data: { rows: [[0]], cols: [{ name: "x" }] },
          row_count: 99,
          status: "completed",
        }),
      );

      const { wrapper } = mountWithStore(<AuditTable table={TABLE} />);

      // ICK
      await delay(100);
      wrapper.update();

      expect(wrapper.find(`[children="Rows 1-100"]`)).toHaveLength(0);
    });
    it("should appear if there's another page", async () => {
      mock.post("/api/dataset", (req, res) =>
        res.json({
          data: { rows: [[0]], cols: [{ name: "x" }] },
          row_count: 100,
          status: "completed",
        }),
      );

      const { wrapper } = mountWithStore(<AuditTable table={TABLE} />);

      // ICK
      await delay(100);
      wrapper.update();

      expect(wrapper.find(`[children="Rows 1-100"]`)).toHaveLength(1);
    });
  });
});
