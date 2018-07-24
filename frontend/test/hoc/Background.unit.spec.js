import React from "react";
import { mount } from "enzyme";
import { withBackground } from "metabase/hoc/Background";

describe("withBackground", () => {
  it("should properly apply the provided class to the body", () => {
    document.body.classList.add("existing-class");

    const TestComponent = withBackground("my-bg-class")(() => <div>Yo</div>);

    let wrapper = mount(<TestComponent />);

    const classListBefore = Object.values(document.body.classList);
    expect(classListBefore.includes("my-bg-class")).toEqual(true);
    expect(classListBefore.includes("existing-class")).toEqual(true);

    wrapper.unmount();

    const classListAfter = Object.values(document.body.classList);
    expect(classListAfter.includes("my-bg-class")).toEqual(false);
    expect(classListAfter.includes("existing-class")).toEqual(true);
  });
});
