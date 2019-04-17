import React from "react";
import { shallow } from "enzyme";

import Icon from "metabase/components/Icon";
import EntityMenuTrigger from "metabase/components/EntityMenuTrigger";

describe("EntityMenuTrigger", () => {
  it("should render the desired icon and call its onClick fn", () => {
    const spy = jest.fn();
    const wrapper = shallow(<EntityMenuTrigger icon="pencil" onClick={spy} />);

    const icon = wrapper.find(Icon);

    expect(icon.length).toBe(1);
    expect(icon.props().name).toEqual("pencil");

    wrapper.simulate("click");
    expect(spy).toHaveBeenCalled();
  });
});
