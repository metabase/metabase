import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";

import { useSetupGuideReturnPath } from "./use-setup-guide-return-path";

function TestComponent() {
  return <div data-testid="return-path">{useSetupGuideReturnPath()}</div>;
}

const setup = (search: string) => {
  renderWithProviders(
    <Route path="embedding/get-started/sso" element={<TestComponent />} />,
    { withRouter: true, initialRoute: `/embedding/get-started/sso${search}` },
  );
};

describe("useSetupGuideReturnPath", () => {
  it("returns the host named by the query parameter", () => {
    setup("?returnToEmbeddingSetupGuide=%2Fsetup-guide");

    expect(screen.getByTestId("return-path")).toHaveTextContent("/setup-guide");
  });

  it("falls back to the hub when the parameter is absent", () => {
    setup("");

    expect(screen.getByTestId("return-path")).toHaveTextContent(
      "/embedding/get-started",
    );
  });

  it("falls back to the hub when the parameter is empty", () => {
    setup("?returnToEmbeddingSetupGuide=");

    expect(screen.getByTestId("return-path")).toHaveTextContent(
      "/embedding/get-started",
    );
  });

  it("falls back to the hub for an off-origin url", () => {
    setup("?returnToEmbeddingSetupGuide=https%3A%2F%2Fevil.test");

    expect(screen.getByTestId("return-path")).toHaveTextContent(
      "/embedding/get-started",
    );
  });

  it("falls back to the hub for a protocol-relative url", () => {
    setup("?returnToEmbeddingSetupGuide=%2F%2Fevil.test");

    expect(screen.getByTestId("return-path")).toHaveTextContent(
      "/embedding/get-started",
    );
  });
});
