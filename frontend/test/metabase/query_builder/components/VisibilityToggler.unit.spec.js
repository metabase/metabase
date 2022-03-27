import React from "react";
import { render, fireEvent } from "@testing-library/react";

import VisibilityToggler from "metabase/query_builder/components/NativeQueryEditor/VisibilityToggler/VisibilityToggler";

describe("VisibilityToggler", () => {
  it("should render collapse icon when open", () => {
    const { container } = render(
      <VisibilityToggler
        isOpen={true}
        isReadOnly={false}
        toggleEditor={() => null}
      />,
    );

    const icons = container.querySelectorAll(".Icon-contract");
    expect(icons.length).toBe(1);
  });

  it("should render expand icon when closed", () => {
    const { container } = render(
      <VisibilityToggler
        isOpen={false}
        readOnly={false}
        toggleEditor={() => null}
      />,
    );

    const icons = container.querySelectorAll(".Icon-expand");
    expect(icons.length).toBe(1);
  });

  it("should render passed class names", () => {
    const testClassName = "test-class-name-" + Math.round(Math.random() * 1000);

    const { container } = render(
      <VisibilityToggler
        isOpen={false}
        readOnly={false}
        toggleEditor={() => null}
        className={testClassName}
      />,
    );

    expect(container.querySelectorAll("." + testClassName).length).toBe(1);
  });

  it("should render hide class when set to read only", () => {
    const { container } = render(
      <VisibilityToggler
        isOpen={false}
        readOnly={true}
        toggleEditor={() => null}
      />,
    );
    expect(container.querySelectorAll(".hide").length).toBe(1);
  });

  it("should fire toggleEditor function on click", () => {
    const spy = jest.fn();

    const { container } = render(
      <VisibilityToggler isOpen={false} readOnly={true} toggleEditor={spy} />,
    );

    const [icon] = container.querySelectorAll(".Icon-expand");
    expect(spy).toHaveBeenCalledTimes(0);
    fireEvent.click(icon);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
