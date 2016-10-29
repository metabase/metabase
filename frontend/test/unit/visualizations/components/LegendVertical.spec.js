
import React from "react";
import ReactDOM from "react-dom";
import { renderIntoDocument } from "react-addons-test-utils";

import LegendVertical from "metabase/visualizations/components/LegendVertical.jsx";

describe("LegendVertical", () => {
    fit ("should render string titles correctly", () => {
        let legend = renderIntoDocument(<LegendVertical titles={["Hello"]} colors={["red"]} />);
        expect(ReactDOM.findDOMNode(legend).textContent).toEqual("Hello");
    });
    fit ("should render array titles correctly", () => {
        let legend = renderIntoDocument(<LegendVertical titles={[["Hello", "world"]]} colors={["red"]} />);
        expect(ReactDOM.findDOMNode(legend).textContent).toEqual("Helloworld");
    });
});
