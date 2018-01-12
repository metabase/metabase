import React from "react";
import renderer from "react-test-renderer";
import moment from "moment";
import { mount } from "enzyme";

import Calendar from "../../src/metabase/components/Calendar";

describe("Calendar", () => {
    it("should render correctly", () => {
        const tree = renderer.create(
            <Calendar selected={moment("2018-01-01")} onChange={() => {}}/>
        ).toJSON();
        expect(tree).toMatchSnapshot()
    });

    it("should switch months correctly", () => {
        const calendar = mount(
            <Calendar selected={moment("2018-01-01")} onChange={() => {}}/>
        );
        expect(calendar.find(".Calendar-header").text()).toEqual("January 2018");
        calendar.find(".Icon-chevronleft").simulate("click");
        expect(calendar.find(".Calendar-header").text()).toEqual("December 2017");
        calendar.find(".Icon-chevronright").simulate("click");
        calendar.find(".Icon-chevronright").simulate("click");
        expect(calendar.find(".Calendar-header").text()).toEqual("February 2018");
    });
});
