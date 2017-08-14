import {
    createTestStore,
    login
} from "__support__/integrated_tests";

import { DashboardApi, PublicApi } from "metabase/services";
import * as Urls from "metabase/lib/urls";
import { getParameterFieldValues } from "metabase/selectors/metadata";
import { ADD_PARAM_VALUES } from "metabase/redux/metadata";
import { mount } from "enzyme";
import {
    fetchDashboard,
    ADD_PARAMETER,
    FETCH_DASHBOARD,
    SAVE_DASHBOARD_AND_CARDS,
    SET_EDITING_DASHBOARD,
    SET_EDITING_PARAMETER_ID
} from "metabase/dashboard/dashboard";
import EditBar from "metabase/components/EditBar";

import { delay } from "metabase/lib/promise"
import DashboardHeader from "metabase/dashboard/components/DashboardHeader";
import { ParameterOptionItem, ParameterOptionsSection } from "metabase/dashboard/components/ParametersPopover";
import ParameterValueWidget from "metabase/parameters/components/ParameterValueWidget";
import { PredefinedRelativeDatePicker } from "metabase/parameters/components/widgets/DateRelativeWidget";
import HeaderModal from "metabase/components/HeaderModal";

// TODO Atte Keinänen 7/17/17: When we have a nice way to create dashboards in tests, this could use a real saved dashboard
// instead of mocking the API endpoint

// Mock the dashboard endpoint using a real response of `public/dashboard/:dashId`
const mockPublicDashboardResponse = {
    "name": "Dashboard",
    "description": "For testing parameter values",
    "id": 40,
    "parameters": [{"name": "Category", "slug": "category", "id": "598ab323", "type": "category"}],
    "ordered_cards": [{
        "sizeX": 6,
        "series": [],
        "card": {
            "id": 25,
            "name": "Orders over time",
            "description": null,
            "display": "line",
            "dataset_query": {"type": "query"}
        },
        "col": 0,
        "id": 105,
        "parameter_mappings": [{
            "parameter_id": "598ab323",
            "card_id": 25,
            "target": ["dimension", ["fk->", 3, 21]]
        }],
        "card_id": 25,
        "visualization_settings": {},
        "dashboard_id": 40,
        "sizeY": 6,
        "row": 0
    }],
    // Parameter values are self-contained in the public dashboard response
    "param_values": {
        "21": {
            "values": ["Doohickey", "Gadget", "Gizmo", "Widget"],
            "human_readable_values": {},
            "field_id": 21
        }
    }
}
PublicApi.dashboard = async () => {
    return mockPublicDashboardResponse;
}

describe("Dashboard", () => {
    beforeAll(async () => {
        await login();
    })

    describe("redux actions", () => {
        describe("fetchDashboard(...)", () => {
            it("should add the parameter values to state tree for public dashboards", async () => {
                const store = await createTestStore();
                // using hash as dashboard id should invoke the public API
                await store.dispatch(fetchDashboard('6e59cc97-3b6a-4bb6-9e7a-5efeee27e40f'));
                await store.waitForActions(ADD_PARAM_VALUES)

                const fieldValues = await getParameterFieldValues(store.getState(), { parameter: { field_id: 21 }});
                expect(fieldValues).toEqual([["Doohickey"], ["Gadget"], ["Gizmo"], ["Widget"]]);
            })
        })
    })

    // Converted from Selenium E2E test

    describe("dashboard page", () => {
        let dashboardId = null;

        it("lets you change title and description", async () => {
            const name = "Customer Feedback Analysis"
            const description = "For seeing the usual response times, feedback topics, our response rate, how often customers are directed to our knowledge base instead of providing a customized response";

            // Create a dashboard programmatically
            const dashboard = await DashboardApi.create({name, description});
            dashboardId = dashboard.id;

            const store = await createTestStore();
            store.pushPath(Urls.dashboard(dashboardId));
            const app = mount(store.getAppContainer());

            await store.waitForActions([FETCH_DASHBOARD])

            // Test dashboard renaming
            app.find(".Icon.Icon-pencil").simulate("click");
            await store.waitForActions([SET_EDITING_DASHBOARD]);

            const headerInputs = app.find(".Header-title input")
            headerInputs.first().simulate("change", {target: {value: "Customer Analysis Paralysis"}})
            headerInputs.at(1).simulate("change", {target: {value: ""}}) // Test empty description

            app.find(EditBar).find(".Button--primary.Button").simulate("click");
            await store.waitForActions([SAVE_DASHBOARD_AND_CARDS, FETCH_DASHBOARD])

            await delay(200)

            expect(app.find(DashboardHeader).text()).toMatch(/Customer Analysis Paralysis/)
        });

        it("lets you add a filter", async () => {
            if (!dashboardId) throw new Error("Test fails because previous tests failed to create a dashboard");

            const store = await createTestStore();
            store.pushPath(Urls.dashboard(dashboardId));
            const app = mount(store.getAppContainer());
            await store.waitForActions([FETCH_DASHBOARD])

            // Test parameter filter creation
            app.find(".Icon.Icon-pencil").simulate("click");
            await store.waitForActions([SET_EDITING_DASHBOARD]);
            app.find(".Icon.Icon-funneladd").simulate("click");
            // Choose Time filter type
            app.find(ParameterOptionsSection)
                .filterWhere((section) => section.text().match(/Time/))
                .simulate("click");

            // Choose Relative date filter
            app.find(ParameterOptionItem)
                .filterWhere((item) => item.text().match(/Relative Date/))
                .simulate("click");

            await store.waitForActions(ADD_PARAMETER)

            app.find(ParameterValueWidget).simulate("click");
            app.find(PredefinedRelativeDatePicker).find("button[children='Yesterday']").simulate("click");
            expect(app.find(ParameterValueWidget).text()).toEqual("Yesterday");

            app.find(HeaderModal).find("button[children='Done']").simulate("click")

            // Wait until the header modal exit animation is finished
            await store.waitForActions([SET_EDITING_PARAMETER_ID])
        })

        afterAll(async () => {
            if (dashboardId) {
                await DashboardApi.update({
                    id: dashboardId,
                    archived: true
                });
            }
        })
    })
})

