import React from "react";
import { render, screen } from "@testing-library/react";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

describe("LoadingAndErrorWrapper", () => {
  describe("Loading", () => {
    it("should display a loading message if given a true loading prop", () => {
      render(<LoadingAndErrorWrapper loading={true} />);

      screen.getByText("Loading...");
    });

    it("should display a given child if loading is false", () => {
      const Child = () => <div>Hey</div>;

      render(
        <LoadingAndErrorWrapper loading={false} error={null}>
          {() => <Child />}
        </LoadingAndErrorWrapper>,
      );
      screen.getByText("Hey");
    });

    it("shouldn't fail if loaded with null children and no wrapper", () => {
      render(<LoadingAndErrorWrapper loading={false} noWrapper />);
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
      screen.getByText("Fun load animation");
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

        screen.getByText("One");
        jest.advanceTimersByTime(interval);

        screen.getByText("Two");
        jest.advanceTimersByTime(interval);

        screen.getByText("Three");
        jest.advanceTimersByTime(interval);

        screen.getByText("One");
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
      screen.getByText(error.message);
    });
  });
});
