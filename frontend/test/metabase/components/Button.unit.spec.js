import React from "react";
import renderer from "react-test-renderer";

import { render } from "enzyme";

import Button from "metabase/components/Button";

describe("Button", () => {
  it("should render correctly", () => {
    const tree = renderer.create(<Button>Clickity click</Button>).toJSON();

    expect(tree).toMatchSnapshot();
  });
  it("should render correctly with an icon", () => {
    const tree = renderer
      .create(<Button icon="star">Clickity click</Button>)
      .toJSON();

    expect(tree).toMatchSnapshot();
  });

  it("should render a primary button given the primary prop", () => {
    const button = render(<Button primary>Clickity click</Button>);

    expect(button.hasClass("Button--primary")).toBe(true);
  });
});
