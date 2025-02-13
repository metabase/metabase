import { render } from "@testing-library/react";

import { withBackground } from "metabase/hoc/Background";

describe("withBackground", () => {
  beforeEach(() => {
    // have an existing class to make sure we don't nuke stuff that might be there already
    document.body.classList.add("existing-class");
  });

  it("should properly apply the provided class to the body", () => {
    const TestComponent = withBackground("my-bg-class")(() => <div>Yo</div>);

    const { unmount } = render(<TestComponent />);

    const classListBefore = Object.values(document.body.classList);
    expect(classListBefore.includes("my-bg-class")).toEqual(true);
    expect(classListBefore.includes("existing-class")).toEqual(true);

    unmount();

    const classListAfter = Object.values(document.body.classList);
    expect(classListAfter.includes("my-bg-class")).toEqual(false);
    expect(classListAfter.includes("existing-class")).toEqual(true);
  });
});
