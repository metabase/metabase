import { act, render, screen } from "__support__/ui";

import { DelayedLoadingAndErrorWrapper } from "./DelayedLoadingAndErrorWrapper";

describe("DelayedLoadingAndErrorWrapper", () => {
  describe("Loading", () => {
    it("should display a loading message if given a true loading prop", () => {
      render(<DelayedLoadingAndErrorWrapper error={false} loading={true} />);

      expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    });

    describe("with a delay", () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it("should display a delayed loader only once the delay has passed", () => {
        render(
          <DelayedLoadingAndErrorWrapper
            loader={<div data-testid="loader"></div>}
            delay={100}
            error={false}
            loading={true}
          />,
        );

        expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
        expect(screen.queryByTestId("loader")).not.toBeInTheDocument();

        act(() => {
          jest.advanceTimersByTime(100);
        });

        expect(screen.getByTestId("loader")).toBeInTheDocument();
        expect(
          screen.queryByTestId("loading-indicator"),
        ).not.toBeInTheDocument();
      });
    });

    it("should display a given child if loading is false", () => {
      render(
        <DelayedLoadingAndErrorWrapper loading={false} error={null}>
          <div>Hey</div>
        </DelayedLoadingAndErrorWrapper>,
      );
      expect(screen.getByText("Hey")).toBeInTheDocument();
    });

    it("shouldn't fail if loaded with null children and no wrapper", () => {
      expect(() =>
        render(
          <DelayedLoadingAndErrorWrapper
            error={false}
            loading={false}
            noWrapper
          />,
        ),
      ).not.toThrow();
    });
  });

  describe("Errors", () => {
    it("should display an error message if given an error object and loading is true", () => {
      const error = {
        type: 500,
        message: "Big error here folks",
      };

      render(<DelayedLoadingAndErrorWrapper loading={true} error={error} />);
      expect(screen.getByText(error.message)).toBeInTheDocument();
    });
  });
});
