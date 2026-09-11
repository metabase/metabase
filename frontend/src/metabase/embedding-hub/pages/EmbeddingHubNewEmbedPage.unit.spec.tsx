import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { SdkIframeEmbedSetupModalProps } from "metabase/plugins";
import { Route } from "metabase/router";

import { EmbeddingHubNewEmbedPage } from "./EmbeddingHubNewEmbedPage";

const initialStateSpy = jest.fn();

jest.mock(
  "metabase/embedding/embedding-iframe-sdk-setup/components/SdkIframeEmbedSetupModal",
  () => ({
    SdkIframeEmbedSetupModal: ({
      initialState,
      onClose,
    }: SdkIframeEmbedSetupModalProps) => {
      initialStateSpy(initialState);

      return <button onClick={onClose}>{"Close wizard"}</button>;
    },
  }),
);

function setup({ initialRoute }: { initialRoute: string }) {
  renderWithProviders(
    <>
      <Route path="/embedding/new" element={<EmbeddingHubNewEmbedPage />} />
      <Route
        path="/embedding/get-started"
        element={<div>{"Get started body"}</div>}
      />
    </>,
    { withRouter: true, initialRoute },
  );
}

describe("EmbeddingHubNewEmbedPage", () => {
  beforeEach(() => {
    initialStateSpy.mockClear();
  });

  // The wizard's callers pass numbers and booleans, which a URL flattens to
  // strings -- "false" is truthy, so the booleans need parsing back.
  it("reads the initial state out of the search params", () => {
    setup({
      initialRoute:
        "/embedding/new?resourceType=dashboard&resourceId=12&isGuest=false",
    });

    expect(initialStateSpy).toHaveBeenCalledWith({
      resourceType: "dashboard",
      resourceId: 12,
      isGuest: false,
    });
  });

  it("passes no initial state when the wizard is opened without one", () => {
    setup({ initialRoute: "/embedding/new" });

    expect(initialStateSpy).toHaveBeenCalledWith({});
  });

  it("returns to Get started when closed on a direct visit", async () => {
    setup({ initialRoute: "/embedding/new" });

    await userEvent.click(screen.getByRole("button", { name: "Close wizard" }));

    expect(await screen.findByText("Get started body")).toBeInTheDocument();
  });
});
