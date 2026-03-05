import { useState } from "react";

import { act, render, screen } from "__support__/ui";

import { RenderIfHasContent } from "./RenderIfHasContent";

describe("RenderIfHasContent", () => {
  it("should render the component when children have text content", () => {
    render(
      <RenderIfHasContent component="section" data-testid="wrapper">
        <span>Hello</span>
      </RenderIfHasContent>,
    );

    expect(screen.getByTestId("wrapper")).toBeInTheDocument();
    expect(screen.getByTestId("wrapper").tagName).toBe("SECTION");
    expect(screen.getByText("Hello")).toBeVisible();
  });

  it("should not render the component when children are empty", () => {
    render(
      <RenderIfHasContent component="section" data-testid="wrapper">
        <div />
      </RenderIfHasContent>,
    );

    expect(screen.queryByTestId("wrapper")).not.toBeInTheDocument();
  });

  it("should not render the component when children only contain empty wrappers", () => {
    render(
      <RenderIfHasContent component="section" data-testid="wrapper">
        <div>
          <div>
            <span />
          </div>
        </div>
      </RenderIfHasContent>,
    );

    expect(screen.queryByTestId("wrapper")).not.toBeInTheDocument();
  });

  it("should render the component when children contain an SVG", () => {
    render(
      <RenderIfHasContent component="section" data-testid="wrapper">
        <button>
          <svg>
            <path d="M0 0" />
          </svg>
        </button>
      </RenderIfHasContent>,
    );

    expect(screen.getByTestId("wrapper")).toBeInTheDocument();
  });

  it("should skip hidden children when checking for content", () => {
    render(
      <RenderIfHasContent component="section" data-testid="wrapper">
        <div hidden>
          <span>Hidden text</span>
        </div>
      </RenderIfHasContent>,
    );

    expect(screen.queryByTestId("wrapper")).not.toBeInTheDocument();
  });

  it("should skip display:none children when checking for content", () => {
    render(
      <RenderIfHasContent component="section" data-testid="wrapper">
        <div style={{ display: "none" }}>
          <span>Hidden text</span>
        </div>
      </RenderIfHasContent>,
    );

    expect(screen.queryByTestId("wrapper")).not.toBeInTheDocument();
  });

  it("should pass props to the rendered component", () => {
    render(
      <RenderIfHasContent
        component="section"
        data-testid="wrapper"
        className="my-class"
        aria-label="test"
      >
        <span>Content</span>
      </RenderIfHasContent>,
    );

    const wrapper = screen.getByTestId("wrapper");
    expect(wrapper).toHaveClass("my-class");
    expect(wrapper).toHaveAttribute("aria-label", "test");
  });

  it("should show the component when content appears dynamically", async () => {
    const Toggle = () => {
      const [show, setShow] = useState(false);
      return (
        <>
          <button onClick={() => setShow(true)}>Show</button>
          <RenderIfHasContent component="section" data-testid="wrapper">
            {show && <span>Dynamic content</span>}
          </RenderIfHasContent>
        </>
      );
    };

    render(<Toggle />);

    expect(screen.queryByTestId("wrapper")).not.toBeInTheDocument();

    await act(async () => {
      screen.getByText("Show").click();
    });

    expect(await screen.findByTestId("wrapper")).toBeInTheDocument();
    expect(screen.getByText("Dynamic content")).toBeVisible();
  });

  it("should hide the component when content is removed dynamically", async () => {
    const Toggle = () => {
      const [show, setShow] = useState(true);
      return (
        <>
          <button onClick={() => setShow(false)}>Hide</button>
          <RenderIfHasContent component="section" data-testid="wrapper">
            {show && <span>Content</span>}
          </RenderIfHasContent>
        </>
      );
    };

    render(<Toggle />);

    expect(screen.getByTestId("wrapper")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeVisible();

    await act(async () => {
      screen.getByText("Hide").click();
    });

    expect(screen.queryByTestId("wrapper")).not.toBeInTheDocument();
  });

  it("should render nested RenderIfHasContent components when content is present", () => {
    render(
      <RenderIfHasContent component="section" data-testid="outer">
        <RenderIfHasContent component="div" data-testid="inner">
          <span>Nested content</span>
        </RenderIfHasContent>
      </RenderIfHasContent>,
    );

    expect(screen.getByTestId("outer")).toBeInTheDocument();
    expect(screen.getByTestId("inner")).toBeInTheDocument();
    expect(screen.getByText("Nested content")).toBeVisible();
  });

  it("should hide nested RenderIfHasContent components when content is empty", () => {
    render(
      <RenderIfHasContent component="section" data-testid="outer">
        <RenderIfHasContent component="div" data-testid="inner">
          <div />
        </RenderIfHasContent>
      </RenderIfHasContent>,
    );

    expect(screen.queryByTestId("outer")).not.toBeInTheDocument();
    expect(screen.queryByTestId("inner")).not.toBeInTheDocument();
  });
});
