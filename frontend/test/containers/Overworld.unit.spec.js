import React from "react";
import Icon from "metabase/components/Icon";

import {
  AdminPinMessage,
  PIN_MESSAGE_STORAGE_KEY,
} from "metabase/containers/Overworld";
import { shallow } from "enzyme";

describe("AdminPinMessage", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  it("should show the admin pin message if the admin hasn't dismissed it", () => {
    const wrapper = shallow(<AdminPinMessage />);

    expect(wrapper.find(Icon).length).toBe(2);
  });

  it("should not show the message if the admin has dismissed it", () => {
    localStorage.setItem(PIN_MESSAGE_STORAGE_KEY, "true");
    const wrapper = shallow(<AdminPinMessage />);
    expect(wrapper.getNode(0)).toBe(null);
  });

  it("should set the proper local storage key if the dismiss icon is clicked", () => {
    const wrapper = shallow(<AdminPinMessage />);
    const dismiss = wrapper.find(Icon).at(1);

    dismiss.simulate("click");

    expect(localStorage.setItem).toHaveBeenCalledWith(
      PIN_MESSAGE_STORAGE_KEY,
      "true",
    );
    expect(wrapper.getNode(0)).toBe(null);
  });
});
