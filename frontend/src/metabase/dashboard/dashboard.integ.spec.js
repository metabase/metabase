import { PublicApi } from "metabase/services";
import { fetchDashboard } from "./dashboard"

import {
    createTestStore,
    login
} from "metabase/__support__/integrated_tests";

import { getParameterFieldValues } from "metabase/selectors/metadata";
import { ADD_PARAM_VALUES } from "metabase/redux/metadata";

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

describe("Dashboard redux actions", () => {
    beforeAll(async () => {
        await login();
    })

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
