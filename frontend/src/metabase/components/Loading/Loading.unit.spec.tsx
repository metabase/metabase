import { render, screen } from "__support__/ui";
import Loading from "metabase/components/Loading";

describe("Loading", () => {
  const Data = () => <div>Data</div>;
  const error = {
    type: 500,
    message: "Big error here folks",
  };
  describe("loading condition", () => {
    it("should display a loading indicator if given a true loading prop", () => {
      render(<Loading loading />);
      expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    });

    it("should display a given component child if loading is false", () => {
      render(
        <Loading loading={false} error={null}>
          <Data />
        </Loading>,
      );
      expect(screen.getByText("Data")).toBeInTheDocument();
      expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
    });

    it("should display a given function child if loading is false", () => {
      render(
        <Loading loading={false} error={null}>
          {() => <Data />}
        </Loading>,
      );
      expect(screen.getByText("Data")).toBeInTheDocument();
      expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
    });

    it("shouldn't fail if loaded with null children and no wrapper", () => {
      expect(() => render(<Loading loading={false} />)).not.toThrow();
    });

    it("can receive a result object", () => {
      const result = { isLoading: true, error: null };
      render(
        <Loading result={result}>
          <Data />
        </Loading>,
      );
      expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
      expect(screen.queryByText("Data")).not.toBeInTheDocument();
    });

    it("can receive a results array", () => {
      const results = [
        { isLoading: true, error: null },
        { isLoading: false, error },
      ];
      render(
        <Loading result={results}>
          <Data />
        </Loading>,
      );
      expect(screen.getByText(error.message)).toBeInTheDocument();
      expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
      expect(screen.queryByText("Data")).not.toBeInTheDocument();
    });
  });

  describe("error condition", () => {
    it("should display an error message if given an error object", () => {
      render(<Loading error={error} />);
      expect(screen.getByText(error.message)).toBeInTheDocument();
    });
  });

  describe("both conditions", () => {
    it("should display an error message if given an error object and loading is true", () => {
      render(<Loading loading error={error} />);
      expect(screen.getByText(error.message)).toBeInTheDocument();
    });
  });
});
