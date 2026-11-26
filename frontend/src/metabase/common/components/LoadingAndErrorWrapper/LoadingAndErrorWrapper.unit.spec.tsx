import { render, screen } from "__support__/ui";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";

describe("LoadingAndErrorWrapper", () => {
  describe("Loading", () => {
    it("should display a loading message if given a true loading prop", () => {
      render(<LoadingAndErrorWrapper loading={true} />);

      expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    });

    it("should display a given child if loading is false", () => {
      const Child = () => <div>Hey</div>;

      render(
        <LoadingAndErrorWrapper loading={false} error={null}>
          {() => <Child />}
        </LoadingAndErrorWrapper>,
      );
      expect(screen.getByText("Hey")).toBeInTheDocument();
    });

    it("shouldn't fail if loaded with null children and no wrapper", () => {
      expect(() =>
        render(<LoadingAndErrorWrapper loading={false} noWrapper />),
      ).not.toThrow();
    });

    it("should render the given loader inside the loading skeleton", () => {
      render(
        <LoadingAndErrorWrapper
          loading={true}
          loader={<div data-testid="custom-skeleton" />}
        >
          <div>Content</div>
        </LoadingAndErrorWrapper>,
      );

      expect(screen.getByTestId("loading-indicator")).toContainElement(
        screen.getByTestId("custom-skeleton"),
      );
      expect(screen.getByRole("status")).toHaveTextContent("Loading...");
      expect(screen.queryByText("Content")).not.toBeInTheDocument();
    });
  });

  describe("Errors", () => {
    it("should display an error message if given an error object", () => {
      const error = {
        type: 500,
        message: "Big error here folks",
      };

      render(<LoadingAndErrorWrapper loading={true} error={error} />);
      expect(screen.getByText(error.message)).toBeInTheDocument();
    });
  });
});
