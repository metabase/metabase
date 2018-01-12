
import React from 'react'
import { mount } from 'enzyme'

import DatePicker from "metabase/query_builder/components/filters/pickers/DatePicker";
import DateOperatorSelector from "metabase/query_builder/components/filters/DateOperatorSelector";
import DateUnitSelector from "metabase/query_builder/components/filters/DateUnitSelector";

const nop = () => {};

describe("DatePicker", () => {
    it("should render 'Previous 30 Days'", () => {
        let picker = mount(<DatePicker filter={["time-interval", ["field-id", 1], -30, "day"]} onFilterChange={nop}/> );
        expect(picker.find(DateOperatorSelector).text()).toEqual("Previous");
        expect(picker.find('input').props().value).toEqual("30");
        expect(picker.find(DateUnitSelector).text()).toEqual("Days");
    });
    it("should render 'Next 1 Month'", () => {
        let picker = mount(<DatePicker filter={["time-interval", ["field-id", 1], 1, "month"]} onFilterChange={nop}/> );
        expect(picker.find(DateOperatorSelector).text()).toEqual("Next");
        expect(picker.find('input').props().value).toEqual("1");
        expect(picker.find(DateUnitSelector).text()).toEqual("Month");
    });
    it("should render 'Current Week'", () => {
        let picker = mount(<DatePicker filter={["time-interval", ["field-id", 1], "current", "week"]} onFilterChange={nop}/> );
        expect(picker.find(DateOperatorSelector).text()).toEqual("Current");
        expect(picker.find(DateUnitSelector).text()).toEqual("Week");
    });
});
