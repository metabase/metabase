import "__support__/integrated_tests";

import React from "react";

import ChartSettingOrderedFields from "metabase/visualizations/components/settings/ChartSettingOrderedFields";

import { ScalarCard } from "../__support__/visualizations";

import { mount } from "enzyme";

function renderVisualization(props) {
    return mount(<ChartSettingOrderedFields className="spread" {...props} />);
}

function getScalarTitles (scalarComponent) {
    return scalarComponent.find('.Scalar-title').map((title) => title.text())
}

function getTitles(viz) {
    return viz.find(LegendHeader).map(header =>
        header.find(LegendItem).map((item) => item.props().title)
    )
}

describe("Visualization", () => {
    describe("not in dashboard", () => {
        describe("scalar card", () => {
            it("should not render title", () => {
                let viz = renderVisualization({ series: [ScalarCard("Foo")] });
                expect(getScalarTitles(viz)).toEqual([]);
            });
        });

        describe("line card", () => {
            it("should not render card title", () => {
                let viz = renderVisualization({ series: [LineCard("Foo")] });
                expect(getTitles(viz)).toEqual([]);
            });
            it("should not render setting title", () => {
                let viz = renderVisualization({ series: [LineCard("Foo", { card: { visualization_settings: { "card.title": "Foo_title" }}})] });
                expect(getTitles(viz)).toEqual([]);
            });
            it("should render breakout multiseries titles", () => {
                let viz = renderVisualization({ series: [MultiseriesLineCard("Foo")] });
                expect(getTitles(viz)).toEqual([
                    ["Foo_cat1", "Foo_cat2"]
                ]);
            });
        });
    });

    describe("in dashboard", () => {
        describe("scalar card", () => {
            it("should render a scalar title, not a legend title", () => {
                let viz = renderVisualization({ series: [ScalarCard("Foo")], showTitle: true, isDashboard: true });
                expect(getTitles(viz)).toEqual([]);
                expect(getScalarTitles(viz).length).toEqual(1);
            });
            it("should render title when loading", () => {
                let viz = renderVisualization({ series: [ScalarCard("Foo", { data: null })], showTitle: true });
                expect(getTitles(viz)).toEqual([
                    ["Foo_name"]
                ]);
            });
            it("should render title when there's an error", () => {
                let viz = renderVisualization({ series: [ScalarCard("Foo")], showTitle: true, error: "oops" });
                expect(getTitles(viz)).toEqual([
                    ["Foo_name"]
                ]);
            });
            it("should not render scalar title", () => {
                let viz = renderVisualization({ series: [ScalarCard("Foo")], showTitle: true });
                expect(getTitles(viz)).toEqual([]);
            });
            it("should render multi scalar titles", () => {
                let viz = renderVisualization({ series: [ScalarCard("Foo"), ScalarCard("Bar")], showTitle: true });
                expect(getTitles(viz)).toEqual([
                    ["Foo_name", "Bar_name"]
                ]);
            });
        });

        describe("line card", () => {
            it("should render normal title", () => {
                let viz = renderVisualization({ series: [LineCard("Foo")], showTitle: true });
                expect(getTitles(viz)).toEqual([
                    ["Foo_name"]
                ]);
            });
            it("should render normal title and breakout multiseries titles", () => {
                let viz = renderVisualization({ series: [MultiseriesLineCard("Foo")], showTitle: true });
                expect(getTitles(viz)).toEqual([
                    ["Foo_name"],
                    ["Foo_cat1", "Foo_cat2"]
                ]);
            });
            it("should render dashboard multiseries titles", () => {
                let viz = renderVisualization({ series: [LineCard("Foo"), LineCard("Bar")], showTitle: true });
                expect(getTitles(viz)).toEqual([
                    ["Foo_name", "Bar_name"]
                ]);
            });
            it("should render dashboard multiseries titles and chart setting title", () => {
                let viz = renderVisualization({ series: [
                    LineCard("Foo", { card: { visualization_settings: { "card.title": "Foo_title" }}}),
                    LineCard("Bar")
                ], showTitle: true });
                expect(getTitles(viz)).toEqual([
                    ["Foo_title"],
                    ["Foo_name", "Bar_name"]
                ]);
            });
            it("should render multiple breakout multiseries titles (with both card titles and breakout values)", () => {
                let viz = renderVisualization({ series: [MultiseriesLineCard("Foo"), MultiseriesLineCard("Bar")], showTitle: true });
                expect(getTitles(viz)).toEqual([
                    ["Foo_name: Foo_cat1", "Foo_name: Foo_cat2", "Bar_name: Bar_cat1", "Bar_name: Bar_cat2"]
                ]);
            });
        });
    });
});
