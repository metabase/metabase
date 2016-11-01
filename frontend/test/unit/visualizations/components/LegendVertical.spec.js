
import React from "react";
import ReactDOM from "react-dom";
import { renderIntoDocument } from "react-addons-test-utils";

import LegendVertical from "metabase/visualizations/components/LegendVertical.jsx";

describe("LegendVertical", () => {
    it ("should render string titles correctly", () => {
        let legend = renderIntoDocument(<LegendVertical titles={["Hello"]} colors={["red"]} />);
        expect(ReactDOM.findDOMNode(legend).textContent).toEqual("Hello");
    });
    it ("should render array titles correctly", () => {
        let legend = renderIntoDocument(<LegendVertical titles={[["Hello", "world"]]} colors={["red"]} />);
        expect(ReactDOM.findDOMNode(legend).textContent).toEqual("Helloworld");
    });
});
