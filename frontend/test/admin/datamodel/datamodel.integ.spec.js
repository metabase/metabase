// Converted from an old Selenium E2E test
import {
    login,
    createTestStore, clickRouterLink,
} from "__support__/integrated_tests";
import { mount } from "enzyme";
import {
    CREATE_METRIC,
    CREATE_SEGMENT,
    FETCH_IDFIELDS,
    INITIALIZE_METADATA,
    SELECT_TABLE,
    UPDATE_FIELD,
    UPDATE_PREVIEW_SUMMARY,
    UPDATE_TABLE
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

describe("admin/datamodel", () => {
    beforeAll(async () =>
        await login()
    );

    // TODO Atte Keinänen 6/22/17: Data model specs are easy to convert to Enzyme, disabled until conversion has been done
    describe("data model editor", () => {
        it("should allow admin to edit data model", async () => {
            const store = await createTestStore();

            store.pushPath('/admin/datamodel/database');
            const app = mount(store.getAppContainer())

            await store.waitForActions([INITIALIZE_METADATA, FETCH_IDFIELDS]);

            // Open "Orders" table section
            const adminListItems = app.find(".AdminList-item");
            adminListItems.at(0).simulate("click");
            await store.waitForActions([SELECT_TABLE]);
            store.resetDispatchedActions()

            // Toggle its visibility to "Hidden"
            app.find("#VisibilityTypes > span").at(1).simulate("click");
            await store.waitForActions([UPDATE_TABLE]);
            store.resetDispatchedActions()

            // Toggle "Why hide" to "Irrelevant/Cruft"
            app.find("#VisibilitySubTypes > span").at(2).simulate("click")
            await store.waitForActions([UPDATE_TABLE]);
            store.resetDispatchedActions()

            // Unhide
            app.find("#VisibilityTypes > span").at(0).simulate("click");

            // Open "People" table section
            adminListItems.at(1).simulate("click");
            await store.waitForActions([SELECT_TABLE]);
            store.resetDispatchedActions()

            // hide fields from people table
            // Set Address field to "Only in Detail Views"
            const columnsListItems = app.find(ColumnsList).find("li")

            columnsListItems.first().find(".TableEditor-field-visibility").simulate("click");
            const onlyInDetailViewsRow = app.find(ColumnarSelector).find(".ColumnarSelector-row").at(1)
            expect(onlyInDetailViewsRow.text()).toMatch(/Only in Detail Views/);
            onlyInDetailViewsRow.simulate("click");
            await store.waitForActions([UPDATE_FIELD]);
            store.resetDispatchedActions();

            // Set Birth Date field to "Do Not Include"
            columnsListItems.at(1).find(".TableEditor-field-visibility").simulate("click");
            // different ColumnarSelector than before so do a new lookup
            const doNotIncludeRow = app.find(ColumnarSelector).find(".ColumnarSelector-row").at(2)
            expect(doNotIncludeRow.text()).toMatch(/Do Not Include/);
            doNotIncludeRow.simulate("click");

            await store.waitForActions([UPDATE_FIELD]);
            store.resetDispatchedActions();

            // modify special type for address field
            columnsListItems.first().find(".TableEditor-field-special-type").simulate("click")
            const entityNameTypeRow = app.find(ColumnarSelector).find(".ColumnarSelector-row").at(1)
            expect(entityNameTypeRow.text()).toMatch(/Entity Name/);
            entityNameTypeRow.simulate("click");
            await store.waitForActions([UPDATE_FIELD]);

            // TODO Atte Keinänen 8/9/17: Currently this test is very lacking because it doesn't validate that
            // the updates actually are reflected in Query Builder :/ It doesn't reset the fields either.
        });

        it("should allow admin to create segments", async () => {
            const store = await createTestStore();

            // Open the People table admin page
            store.pushPath('/admin/datamodel/database/1/table/2');
            const app = mount(store.getAppContainer())

            await store.waitForActions([INITIALIZE_METADATA, FETCH_IDFIELDS]);
            store.resetDispatchedActions();

            // Click the new segment button and check that we get properly redirected
            clickRouterLink(app.find(SegmentsList).find(Link));
            expect(store.getPath()).toBe('/admin/datamodel/segment/create?table=2')
            await store.waitForActions([FETCH_TABLE_METADATA, UPDATE_PREVIEW_SUMMARY]);
            store.resetDispatchedActions();

            // Add "Email Is Not gmail" filter
            app.find(".GuiBuilder-filtered-by a").first().simulate("click");

            const filterPopover = app.find(FilterPopover);
            filterPopover.find(FieldList).find('h4[children="Email"]').simulate("click");

            const operatorSelector = filterPopover.find(OperatorSelector);
            operatorSelector.find('button[children="Is not"]').simulate("click");

            const addFilterButton = filterPopover.find(".Button.disabled");

            filterPopover.find('textarea.border-purple').simulate('change', { target: { value: "gmail" }})
            await addFilterButton.simulate("click");

            await store.waitForActions([UPDATE_PREVIEW_SUMMARY]);

            // Add name and description
            app.find("input[name='name']").simulate('change', { target: { value: 'Gmail users' }});
            app.find("textarea[name='description']").simulate("change", { target: { value: 'All people using Gmail for email'}});

            // Save the segment
            app.find('button[children="Save changes"]').simulate("click");

            await store.waitForActions([CREATE_SEGMENT, INITIALIZE_METADATA]);
            store.resetDispatchedActions();
            expect(store.getPath()).toBe("/admin/datamodel/database/1/table/2")

            // Validate that the segment got actually added
            expect(app.find(SegmentsList).find(SegmentItem).first().text()).toEqual("Gmail usersFiltered by Email");
        })

        it("should allow admin to create metrics", async () => {
            const store = await createTestStore();

            // Open the People table admin page
            store.pushPath('/admin/datamodel/database/1/table/2');
            const app = mount(store.getAppContainer())

            await store.waitForActions([INITIALIZE_METADATA, FETCH_IDFIELDS]);
            store.resetDispatchedActions();

            // Click the new metric button and check that we get properly redirected
            clickRouterLink(app.find(MetricsList).find(Link));
            expect(store.getPath()).toBe('/admin/datamodel/metric/create?table=2')
            await store.waitForActions([FETCH_TABLE_METADATA, UPDATE_PREVIEW_SUMMARY]);

            app.find("#Query-section-aggregation").simulate("click");
            app.find("#AggregationPopover").find('h4[children="Count of rows"]').simulate("click");

            app.find("input[name='name']").simulate('change', { target: { value: 'User count' }});
            app.find("textarea[name='description']").simulate("change", { target: { value: 'Total number of users'}});

            // Save the metric
            app.find('button[children="Save changes"]').simulate("click");

            await store.waitForActions([CREATE_METRIC, INITIALIZE_METADATA]);
            expect(store.getPath()).toBe("/admin/datamodel/database/1/table/2")

            // Validate that the segment got actually added
            expect(app.find(MetricsList).find(MetricItem).first().text()).toEqual("User countCount");
        });
    });
});
