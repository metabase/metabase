import React from "react";
import { shallow, mount } from "enzyme";
import { Link } from "react-router";

import Icon from "metabase/components/Icon";
import EntityMenuItem from "metabase/components/EntityMenuItem";

describe("EntityMenuItem", () => {
  it("should display the proper title and icon", () => {
    const wrapper = shallow(
      <EntityMenuItem
        title="A pencil icon"
        icon="pencil"
        action={() => ({})}
      />,
    );

    const icon = wrapper.find(Icon);

    expect(icon.length).toBe(1);
    expect(icon.props().name).toEqual("pencil");
  });

  describe("actions and links", () => {
    describe("actions", () => {
      it("should call an action function if an action is provided", () => {
        const spy = jest.fn();

        const wrapper = mount(
          <EntityMenuItem title="A pencil icon" icon="pencil" action={spy} />,
        );

        wrapper.simulate("click");
        expect(spy).toHaveBeenCalled();
      });
    });

    describe("links", () => {
      it("should be a link if a link is provided", () => {
        const wrapper = mount(
          <EntityMenuItem title="A pencil icon" icon="pencil" link="/derp" />,
        );

        expect(wrapper.find(Link).length).toBe(1);
      });
    });
  });
});
