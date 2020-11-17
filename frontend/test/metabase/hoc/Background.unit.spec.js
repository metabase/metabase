import React from "react";
import jsdom from "jsdom";
import { mount } from "enzyme";
import { withBackground } from "metabase/hoc/Background";

describe("withBackground", () => {
  let wrapper;

  beforeEach(() => {
    window.document = jsdom.jsdom("");
    document.body.appendChild(document.createElement("div"));
    // have an existing class to make sure we don't nuke stuff that might be there already
    document.body.classList.add("existing-class");
  });

  afterEach(() => {
    wrapper.detach();
    window.document = jsdom.jsdom("");
  });

  it("should properly apply the provided class to the body", () => {
    const TestComponent = withBackground("my-bg-class")(() => <div>Yo</div>);

    wrapper = mount(<TestComponent />, { attachTo: document.body.firstChild });

    const classListBefore = Object.values(document.body.classList);
    expect(classListBefore.includes("my-bg-class")).toEqual(true);
    expect(classListBefore.includes("existing-class")).toEqual(true);

    wrapper.unmount();

    const classListAfter = Object.values(document.body.classList);
    expect(classListAfter.includes("my-bg-class")).toEqual(false);
    expect(classListAfter.includes("existing-class")).toEqual(true);
  });
});
