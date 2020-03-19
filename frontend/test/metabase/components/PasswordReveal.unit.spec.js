import { click } from "__support__/enzyme";

import React from "react";
import PasswordReveal from "metabase/components/PasswordReveal";
import CopyButton from "metabase/components/CopyButton";

import { shallow } from "enzyme";

describe("password reveal", () => {
  let wrapper;

  beforeEach(() => {
    wrapper = shallow(<PasswordReveal />);
  });

  it("should toggle the visibility state when hide / show are clicked", () => {
    expect(wrapper.state().visible).toEqual(false);
    click(wrapper.find("a"));
    expect(wrapper.state().visible).toEqual(true);
  });

  it("should render a copy button", () => {
    expect(wrapper.find(CopyButton).length).toEqual(1);
  });
});
