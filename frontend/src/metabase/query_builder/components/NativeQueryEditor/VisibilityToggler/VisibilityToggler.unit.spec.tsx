import { render, fireEvent, screen } from "@testing-library/react";

import { getIcon } from "__support__/ui";
import { VisibilityToggler } from "metabase/query_builder/components/NativeQueryEditor/VisibilityToggler";

describe("VisibilityToggler", () => {
  it("should render collapse icon when open", () => {
    render(
      <VisibilityToggler
        isOpen={true}
        readOnly={false}
        toggleEditor={() => null}
      />,
    );

    expect(getIcon("contract")).toBeInTheDocument();
  });

  it("should render expand icon when closed", () => {
    render(
      <VisibilityToggler
        isOpen={false}
        readOnly={false}
        toggleEditor={() => null}
      />,
    );

    expect(getIcon("expand")).toBeInTheDocument();
  });

  it("should render passed class names", () => {
    const testClassName = "test-class-name-" + Math.round(Math.random() * 1000);

    render(
      <VisibilityToggler
        isOpen={false}
        readOnly={false}
        toggleEditor={() => null}
        className={testClassName}
      />,
    );

    expect(screen.getByTestId("visibility-toggler")).toHaveClass(testClassName);
  });

  it("should render hidden when set to read only", () => {
    render(
      <VisibilityToggler
        isOpen={false}
        readOnly={true}
        toggleEditor={() => null}
      />,
    );
    expect(screen.getByTestId("visibility-toggler")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("should fire toggleEditor function on click", () => {
    const spy = jest.fn();

    render(
      <VisibilityToggler isOpen={false} readOnly={true} toggleEditor={spy} />,
    );

    expect(spy).toHaveBeenCalledTimes(0);
    fireEvent.click(getIcon("expand"));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
