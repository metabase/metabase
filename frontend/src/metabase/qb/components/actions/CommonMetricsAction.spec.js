/* eslint-disable flowtype/require-valid-file-annotation */

import CommonMetricsAction from "./CommonMetricsAction";

import { card, tableMetadata } from "../__support__/fixtures";

const mockMetric = {
    id: 123,
    table_id: 10,
    name: "Mock Metric"
};

const tableMetadata0Metrics = { ...tableMetadata, metrics: [] };
const tableMetadata1Metric = { ...tableMetadata, metrics: [mockMetric] };
const tableMetadata6Metrics = {
    ...tableMetadata,
    metrics: [
        mockMetric,
        mockMetric,
        mockMetric,
        mockMetric,
        mockMetric,
        mockMetric
    ]
};

describe("CommonMetricsAction", () => {
    it("should not be valid if the table has no metrics", () => {
        expect(
            CommonMetricsAction({
                card,
                tableMetadata: tableMetadata0Metrics
            })
        ).toHaveLength(0);
    });
    it("should return a scalar card for the metric", () => {
        const actions = CommonMetricsAction({
            card,
            tableMetadata: tableMetadata1Metric
        });
        expect(actions).toHaveLength(1);
        const newCard = actions[0].card();
        expect(newCard.dataset_query.query).toEqual({
            source_table: 10,
            aggregation: [["METRIC", 123]]
        });
        expect(newCard.display).toEqual("scalar");
    });
    it("should only return up to 5 actions", () => {
        expect(
            CommonMetricsAction({
                card,
                tableMetadata: tableMetadata6Metrics
            })
        ).toHaveLength(5);
    });
});
