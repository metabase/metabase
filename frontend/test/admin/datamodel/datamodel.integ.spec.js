// Converted from an old Selenium E2E test
import {
  useSharedAdminLogin,
  createTestStore,
  deleteAllSegments,
  deleteAllMetrics,
} from "__support__/integrated_tests";
import { click, clickButton, setInputValue } from "__support__/enzyme_utils";
import { mount } from "enzyme";
import {
  CREATE_METRIC,
  CREATE_SEGMENT,
  FETCH_IDFIELDS,
  INITIALIZE_METADATA,
  SELECT_TABLE,
  UPDATE_FIELD,
  UPDATE_PREVIEW_SUMMARY,
  UPDATE_TABLE,
} from "metabase/admin/datamodel/datamodel";
import { FETCH_TABLE_METADATA } from "metabase/redux/metadata";

import { Link } from "react-router";
import ColumnsList from "metabase/admin/datamodel/components/database/ColumnsList";
import ColumnarSelector from "metabase/components/ColumnarSelector";
import SegmentsList from "metabase/admin/datamodel/components/database/SegmentsList";
import OperatorSelector from "metabase/query_builder/components/filters/OperatorSelector";
import FilterPopover from "metabase/query_builder/components/filters/FilterPopover";
import FieldList from "metabase/query_builder/components/FieldList";
import SegmentItem from "metabase/admin/datamodel/components/database/SegmentItem";
import MetricsList from "metabase/admin/datamodel/components/database/MetricsList";
import MetricItem from "metabase/admin/datamodel/components/database/MetricItem";
import { MetabaseApi } from "metabase/services";

describe("admin/datamodel", () => {
  beforeAll(async () => useSharedAdminLogin());

  describe("data model editor", () => {
    it("should allow admin to edit data model", async () => {
      const store = await createTestStore();

      store.pushPath("/admin/datamodel/database");
      const app = mount(store.getAppContainer());

      await store.waitForActions([INITIALIZE_METADATA, FETCH_IDFIELDS]);

      // Open "Orders" table section
      const adminListItems = app.find(".AdminList-item");
      click(adminListItems.at(0));
      await store.waitForActions([SELECT_TABLE]);

      // Toggle its visibility to "Hidden"
      click(app.find("#VisibilityTypes > span").at(1));
      await store.waitForActions([UPDATE_TABLE]);

      // Toggle "Why hide" to "Irrelevant/Cruft"
      click(app.find("#VisibilitySubTypes > span").at(2));
      await store.waitForActions([UPDATE_TABLE]);

      // Unhide
      click(app.find("#VisibilityTypes > span").at(0));

      // Open "People" table section
      click(adminListItems.at(1));
      await store.waitForActions([SELECT_TABLE]);

      // hide fields from people table
      // Set Address field to "Only in Detail Views"
      const columnsListItems = app.find(ColumnsList).find("li");

      click(columnsListItems.first().find(".TableEditor-field-visibility"));
      const onlyInDetailViewsRow = app
        .find(ColumnarSelector)
        .find(".ColumnarSelector-row")
        .at(1);
      expect(onlyInDetailViewsRow.text()).toMatch(/Only in Detail Views/);
      click(onlyInDetailViewsRow);
      await store.waitForActions([UPDATE_FIELD]);

      // Set Birth Date field to "Do Not Include"
      click(columnsListItems.at(1).find(".TableEditor-field-visibility"));
      // different ColumnarSelector than before so do a new lookup
      const doNotIncludeRow = app
        .find(ColumnarSelector)
        .find(".ColumnarSelector-row")
        .at(2);
      expect(doNotIncludeRow.text()).toMatch(/Do Not Include/);
      click(doNotIncludeRow);

      await store.waitForActions([UPDATE_FIELD]);

      // modify special type for address field
      click(columnsListItems.first().find(".TableEditor-field-special-type"));
      const entityNameTypeRow = app
        .find(ColumnarSelector)
        .find(".ColumnarSelector-row")
        .at(1);
      expect(entityNameTypeRow.text()).toMatch(/Entity Name/);
      click(entityNameTypeRow);
      await store.waitForActions([UPDATE_FIELD]);

      // TODO Atte Keinänen 8/9/17: Currently this test doesn't validate that the updates actually are reflected in QB
    });

    it("should allow admin to create segments", async () => {
      const store = await createTestStore();

      // Open the People table admin page
      store.pushPath("/admin/datamodel/database/1/table/2");
      const app = mount(store.getAppContainer());

      await store.waitForActions([INITIALIZE_METADATA, FETCH_IDFIELDS]);

      // Click the new segment button and check that we get properly redirected
      click(app.find(SegmentsList).find(Link));
      expect(store.getPath()).toBe("/admin/datamodel/segment/create?table=2");
      await store.waitForActions([
        FETCH_TABLE_METADATA,
        UPDATE_PREVIEW_SUMMARY,
      ]);

      // Add "Email Is Not gmail" filter
      click(app.find(".GuiBuilder-filtered-by a").first());

      const filterPopover = app.find(FilterPopover);
      click(filterPopover.find(FieldList).find('h4[children="Email"]'));

      // click to expand options
      const operatorSelector = filterPopover.find(OperatorSelector);
      click(operatorSelector);
      // click "Is Not"
      clickButton(operatorSelector.find('[children="Is not"]'));

      const addFilterButton = filterPopover.find(".Button.disabled");

      setInputValue(filterPopover.find("input"), "gmail");
      await clickButton(addFilterButton);

      await store.waitForActions([UPDATE_PREVIEW_SUMMARY]);

      // Add name and description
      setInputValue(app.find("input[name='name']"), "Gmail users");
      setInputValue(app.find("textarea[name='description']"), "change");

      // Save the segment
      click(app.find('button[children="Save changes"]'));

      await store.waitForActions([CREATE_SEGMENT, INITIALIZE_METADATA]);
      expect(store.getPath()).toBe("/admin/datamodel/database/1/table/2");

      // Validate that the segment got actually added
      expect(
        app
          .find(SegmentsList)
          .find(SegmentItem)
          .first()
          .text(),
      ).toEqual("Gmail usersFiltered by Email");
    });

    it("should allow admin to create metrics", async () => {
      const store = await createTestStore();

      // Open the People table admin page
      store.pushPath("/admin/datamodel/database/1/table/2");
      const app = mount(store.getAppContainer());

      await store.waitForActions([INITIALIZE_METADATA, FETCH_IDFIELDS]);

      // Click the new metric button and check that we get properly redirected
      click(app.find(MetricsList).find(Link));
      expect(store.getPath()).toBe("/admin/datamodel/metric/create?table=2");
      await store.waitForActions([
        FETCH_TABLE_METADATA,
        UPDATE_PREVIEW_SUMMARY,
      ]);

      click(app.find("#Query-section-aggregation"));
      click(
        app.find("#AggregationPopover").find('h4[children="Count of rows"]'),
      );

      setInputValue(app.find("input[name='name']"), "User count");
      setInputValue(
        app.find("textarea[name='description']"),
        "Total number of users",
      );

      // Save the metric
      click(app.find('button[children="Save changes"]'));

      await store.waitForActions([CREATE_METRIC, INITIALIZE_METADATA]);
      expect(store.getPath()).toBe("/admin/datamodel/database/1/table/2");

      // Validate that the segment got actually added
      expect(
        app
          .find(MetricsList)
          .find(MetricItem)
          .first()
          .text(),
      ).toEqual("User countCount");
    });

    afterAll(() =>
      Promise.all([
        MetabaseApi.table_update({ id: 1, visibility_type: null }), // Sample Dataset
        MetabaseApi.field_update({
          id: 8,
          visibility_type: "normal",
          special_type: null,
        }), // Address
        MetabaseApi.field_update({ id: 9, visibility_type: "normal" }), // Address
        deleteAllSegments(),
        deleteAllMetrics(),
      ]),
    );
  });
});
