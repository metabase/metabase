import "__support__/e2e";

import React from "react";

import Visualization from "metabase/visualizations/components/Visualization";

import LegendHeader from "metabase/visualizations/components/LegendHeader";
import LegendItem from "metabase/visualizations/components/LegendItem";

import {
  ScalarCard,
  LineCard,
  MultiseriesLineCard,
  TextCard,
} from "../__support__/visualizations";

import { mount } from "enzyme";
import { click } from "__support__/enzyme";

function renderVisualization(props) {
  return mount(<Visualization className="spread" {...props} />);
}

function getScalarTitles(scalarComponent) {
  return scalarComponent.find(".Scalar-title").map(title => title.text());
}

function getTitles(viz) {
  return viz
    .find(LegendHeader)
    .map(header => header.find(LegendItem).map(item => item.props().title));
}

describe("Visualization", () => {
  describe("not in dashboard", () => {
    describe("scalar card", () => {
      it("should not render title", () => {
        const viz = renderVisualization({ rawSeries: [ScalarCard("Foo")] });
        expect(getScalarTitles(viz)).toEqual([]);
      });
    });

    describe("line card", () => {
      it("should not render card title", () => {
        const viz = renderVisualization({ rawSeries: [LineCard("Foo")] });
        expect(getTitles(viz)).toEqual([]);
      });
      it("should not render setting title", () => {
        const viz = renderVisualization({
          rawSeries: [
            LineCard("Foo", {
              card: { visualization_settings: { "card.title": "Foo_title" } },
            }),
          ],
        });
        expect(getTitles(viz)).toEqual([]);
      });
      it("should render breakout multiseries titles", () => {
        const viz = renderVisualization({
          rawSeries: [MultiseriesLineCard("Foo")],
        });
        expect(getTitles(viz)).toEqual([["Foo_cat1", "Foo_cat2"]]);
      });
    });
  });

  describe("in dashboard", () => {
    describe("scalar card", () => {
      it("should render a scalar title, not a legend title", () => {
        const viz = renderVisualization({
          rawSeries: [ScalarCard("Foo")],
          showTitle: true,
          isDashboard: true,
        });
        expect(getTitles(viz)).toEqual([]);
        expect(getScalarTitles(viz).length).toEqual(1);
      });
      it("should render title when loading", () => {
        const viz = renderVisualization({
          rawSeries: [ScalarCard("Foo", { data: null })],
          showTitle: true,
        });
        expect(getTitles(viz)).toEqual([["Foo_name"]]);
      });
      it("should render title when there's an error", () => {
        const viz = renderVisualization({
          rawSeries: [ScalarCard("Foo")],
          showTitle: true,
          error: "oops",
        });
        expect(getTitles(viz)).toEqual([["Foo_name"]]);
      });
      it("should not render scalar title", () => {
        const viz = renderVisualization({
          rawSeries: [ScalarCard("Foo")],
          showTitle: true,
        });
        expect(getTitles(viz)).toEqual([]);
      });
      it("should render multi scalar titles", () => {
        const viz = renderVisualization({
          rawSeries: [ScalarCard("Foo"), ScalarCard("Bar")],
          showTitle: true,
        });
        expect(getTitles(viz)).toEqual([["Foo_name", "Bar_name"]]);
      });
    });

    describe("line card", () => {
      it("should render normal title", () => {
        const viz = renderVisualization({
          rawSeries: [LineCard("Foo")],
          showTitle: true,
        });
        expect(getTitles(viz)).toEqual([["Foo_name"]]);
      });
      it("should render a blank title", () => {
        const viz = renderVisualization({
          rawSeries: [LineCard("")],
          showTitle: true,
        });
        expect(getTitles(viz)).toEqual([["_name"]]);
      });
      it("should render normal title and breakout multiseries titles", () => {
        const viz = renderVisualization({
          rawSeries: [MultiseriesLineCard("Foo")],
          showTitle: true,
        });
        expect(getTitles(viz)).toEqual([
          ["Foo_name"],
          ["Foo_cat1", "Foo_cat2"],
        ]);
      });
      it("should render dashboard multiseries titles", () => {
        const viz = renderVisualization({
          rawSeries: [LineCard("Foo"), LineCard("Bar")],
          showTitle: true,
        });
        expect(getTitles(viz)).toEqual([["Foo_name", "Bar_name"]]);
      });
      it("should render dashboard multiseries titles and chart setting title", () => {
        const viz = renderVisualization({
          rawSeries: [
            LineCard("Foo", {
              card: { visualization_settings: { "card.title": "Foo_title" } },
            }),
            LineCard("Bar"),
          ],
          showTitle: true,
        });
        expect(getTitles(viz)).toEqual([
          ["Foo_title"],
          ["Foo_name", "Bar_name"],
        ]);
      });
      it("should render multiple breakout multiseries titles (with both card titles and breakout values)", () => {
        const viz = renderVisualization({
          rawSeries: [MultiseriesLineCard("Foo"), MultiseriesLineCard("Bar")],
          showTitle: true,
        });
        expect(getTitles(viz)).toEqual([
          [
            "Foo_name: Foo_cat1",
            "Foo_name: Foo_cat2",
            "Bar_name: Bar_cat1",
            "Bar_name: Bar_cat2",
          ],
        ]);
      });
    });

    describe("text card", () => {
      describe("when not editing", () => {
        it("should not render edit and preview actions", () => {
          const viz = renderVisualization({
            rawSeries: [TextCard("Foo")],
            isEditing: false,
          });
          expect(viz.find(".Icon-edit_document").length).toEqual(0);
          expect(viz.find(".Icon-eye").length).toEqual(0);
        });

        it("should render in the view mode", () => {
          const textCard = TextCard("Foo", {
            card: {
              display: "text",
              visualization_settings: {
                text: "# Foobar",
              },
            },
          });
          const viz = renderVisualization({
            rawSeries: [textCard],
            isEditing: false,
          });
          expect(viz.find("textarea").length).toEqual(0);
          expect(viz.find(".text-card-markdown").find("h1").length).toEqual(1);
          expect(viz.find(".text-card-markdown").text()).toEqual("Foobar");
        });
      });

      describe("when editing", () => {
        it("should render edit and preview actions", () => {
          const viz = renderVisualization({
            rawSeries: [TextCard("Foo")],
            isEditing: true,
          });
          expect(viz.find(".Icon-edit_document").length).toEqual(1);
          expect(viz.find(".Icon-eye").length).toEqual(1);
        });

        it("should render in the edit mode", () => {
          const viz = renderVisualization({
            rawSeries: [TextCard("Foo")],
            isEditing: true,
          });
          expect(viz.find("textarea").length).toEqual(1);
        });

        describe("toggling edit/preview modes", () => {
          it("should switch between rendered markdown and textarea input", () => {
            const viz = renderVisualization({
              rawSeries: [TextCard("Foo")],
              isEditing: true,
            });
            expect(viz.find("textarea").length).toEqual(1);
            click(viz.find(".Icon-eye"));
            expect(viz.find("textarea").length).toEqual(0);
            expect(viz.find(".text-card-markdown").length).toEqual(1);
            click(viz.find(".Icon-edit_document"));
            expect(viz.find(".text-card-markdown").length).toEqual(0);
            expect(viz.find("textarea").length).toEqual(1);
          });
        });
      });
    });
  });
});
