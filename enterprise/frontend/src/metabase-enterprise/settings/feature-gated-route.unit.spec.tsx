import { act } from "react";

import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import { settingsApi } from "metabase/settings";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { featureGatedRoute } from "./feature-gated-route";

const setup = ({ enabled }: { enabled: boolean }) => {
  const enabledPage = jest.fn(async () => ({
    Component: () => <div>Licensed page</div>,
  }));
  const disabledPage = jest.fn(async () => ({
    Component: () => <div>Upsell page</div>,
  }));

  const { store, router } = renderWithProviders(
    <>
      <Route
        path="/gated"
        lazy={featureGatedRoute("audit_app", enabledPage, disabledPage)}
      />
      <Route path="/elsewhere" element={<div>Elsewhere</div>} />
    </>,
    {
      initialRoute: "/gated",
      withRouter: true,
      storeInitialState: createMockState({
        settings: mockSettings({
          "token-features": createMockTokenFeatures({ audit_app: enabled }),
        }),
      }),
    },
  );

  // What a settings refresh does in an open session: the session properties
  // cache gets new data, and nothing reloads the page or the router.
  const setFeature = (value: boolean) =>
    act(async () => {
      await store.dispatch(
        settingsApi.util.upsertQueryData(
          "getSessionProperties",
          undefined,
          createMockSettings({
            "token-features": createMockTokenFeatures({ audit_app: value }),
          }),
        ),
      );
    });

  return { enabledPage, disabledPage, router, setFeature };
};

describe("featureGatedRoute", () => {
  it("renders the page the feature picks", async () => {
    setup({ enabled: true });

    expect(await screen.findByText("Licensed page")).toBeInTheDocument();
  });

  it("does not load the page the feature hides", async () => {
    const { enabledPage, disabledPage } = setup({ enabled: false });

    expect(await screen.findByText("Upsell page")).toBeInTheDocument();
    expect(disabledPage).toHaveBeenCalledTimes(1);
    expect(enabledPage).not.toHaveBeenCalled();
  });

  it("follows a feature change on a revisit in the same session", async () => {
    // The router resolves a route's lazy once per session, so this is the
    // regression: visit, leave, gain the feature, and come back.
    const { router, setFeature } = setup({ enabled: false });

    expect(await screen.findByText("Upsell page")).toBeInTheDocument();

    await act(async () => {
      await router?.navigate("/elsewhere");
    });
    expect(await screen.findByText("Elsewhere")).toBeInTheDocument();

    await setFeature(true);

    await act(async () => {
      await router?.navigate("/gated");
    });
    expect(await screen.findByText("Licensed page")).toBeInTheDocument();
  });

  it("follows a feature change while the page is open", async () => {
    const { setFeature } = setup({ enabled: false });

    expect(await screen.findByText("Upsell page")).toBeInTheDocument();

    await setFeature(true);

    expect(await screen.findByText("Licensed page")).toBeInTheDocument();
  });
});
