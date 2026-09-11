import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { SdkIframeEmbedSetupModalProps } from "metabase/plugins";
import { Route, useNavigate } from "metabase/router";
import * as Urls from "metabase/urls";

import { SdkIframeEmbedSetupPage } from "./SdkIframeEmbedSetupPage";

const initialStateSpy = jest.fn();

jest.mock("./SdkIframeEmbedSetupModal", () => ({
  SdkIframeEmbedSetupModal: ({
    initialState,
    onClose,
  }: SdkIframeEmbedSetupModalProps) => {
    initialStateSpy(initialState);

    return <button onClick={onClose}>{"Close wizard"}</button>;
  },
}));

function setup({ initialRoute }: { initialRoute: string }) {
  renderWithProviders(
    <>
      <Route
        path="/embedding/tenancy/new-embed"
        element={<SdkIframeEmbedSetupPage />}
      />
      <Route
        path="/embedding/get-started/new-embed"
        element={<SdkIframeEmbedSetupPage />}
      />
      <Route path="/embedding/tenancy" element={<div>{"Tenancy body"}</div>} />
      <Route
        path="/embedding/get-started"
        element={<div>{"Get started body"}</div>}
      />
      {/* A sub-route, so returning here is distinguishable from walking the
          wizard's own path up a segment. */}
      <Route
        path="/embedding/get-started/permissions"
        element={<OpenWizardButton />}
      />
    </>,
    { withRouter: true, initialRoute },
  );
}

/** Stands in for the hub entry points, which build the wizard's URL this way. */
function OpenWizardButton() {
  const navigate = useNavigate();

  return (
    <button
      onClick={() =>
        navigate(
          Urls.embeddingHubNewEmbed(Urls.embeddingHubGetStarted(), {
            resourceType: "dashboard",
            resourceId: 12,
            isGuest: false,
          }),
        )
      }
    >
      {"Open wizard"}
    </button>
  );
}

describe("SdkIframeEmbedSetupPage", () => {
  beforeEach(() => {
    initialStateSpy.mockClear();
  });

  // Round-trips through the URL builder, so the param names stay in step with
  // the parser -- a URL flattens the number and the booleans to strings.
  it("passes the opener's initial state to the wizard", async () => {
    setup({ initialRoute: "/embedding/get-started/permissions" });

    await userEvent.click(screen.getByRole("button", { name: "Open wizard" }));

    expect(
      await screen.findByRole("button", { name: "Close wizard" }),
    ).toBeInTheDocument();
    expect(initialStateSpy).toHaveBeenLastCalledWith({
      resourceType: "dashboard",
      resourceId: 12,
      isGuest: false,
    });
  });

  it("passes no initial state when opened without one", () => {
    setup({ initialRoute: "/embedding/tenancy/new-embed" });

    expect(initialStateSpy).toHaveBeenCalledWith({});
  });

  // The fix itself: opening pushes a history entry, so closing pops back to
  // whichever page opened the wizard (EMB-2362).
  it("returns to the page that opened it", async () => {
    setup({ initialRoute: "/embedding/get-started/permissions" });

    await userEvent.click(screen.getByRole("button", { name: "Open wizard" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Close wizard" }),
    );

    expect(
      await screen.findByRole("button", { name: "Open wizard" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Get started body")).not.toBeInTheDocument();
  });

  // A direct visit has no history entry to pop, so it has to fall back to the
  // page its path hangs off rather than stranding the user on a blank route.
  it("returns to the page it hangs off when closed on a direct visit", async () => {
    setup({ initialRoute: "/embedding/tenancy/new-embed" });

    await userEvent.click(screen.getByRole("button", { name: "Close wizard" }));

    expect(await screen.findByText("Tenancy body")).toBeInTheDocument();
  });
});
