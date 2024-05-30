import { act, render, screen } from "__support__/ui";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

describe("LoadingAndErrorWrapper", () => {
  describe("Loading", () => {
    it("should display a loading message if given a true loading prop", () => {
      render(<LoadingAndErrorWrapper loading={true} />);

      expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
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

    it("should display a given scene during loading", () => {
      const Scene = () => <div>Fun load animation</div>;

      render(
        <LoadingAndErrorWrapper
          loading={true}
          error={null}
          loadingScenes={[<Scene key="0" />]}
        />,
      );
      expect(screen.getByText("Fun load animation")).toBeInTheDocument();
    });

    describe("cycling", () => {
      it("should cycle through loading messages if provided", () => {
        jest.useFakeTimers();

        const interval = 6000;

        render(
          <LoadingAndErrorWrapper
            loading={true}
            error={null}
            loadingMessages={["One", "Two", "Three"]}
            messageInterval={interval}
          />,
        );

        expect(screen.getByText("One")).toBeInTheDocument();
        act(() => {
          jest.advanceTimersByTime(interval);
        });

        expect(screen.getByText("Two")).toBeInTheDocument();
        act(() => {
          jest.advanceTimersByTime(interval);
        });

        expect(screen.getByText("Three")).toBeInTheDocument();
        act(() => {
          jest.advanceTimersByTime(interval);
        });

        expect(screen.getByText("One")).toBeInTheDocument();
      });
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
