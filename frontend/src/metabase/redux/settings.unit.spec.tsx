import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { setupPropertiesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  sessionApi,
  useGetSessionPropertiesQuery,
  useGetSettingsQuery,
} from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { createMockSettings } from "metabase-types/api/mocks";
import type { State } from "metabase-types/store";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { refreshSiteSettings } from "./settings";

const TestGetComponent = () => {
  const siteNameFromSelector = useSelector((state: State) =>
    getSetting(state, "site-name"),
  );
  const siteNameFromHook = useSetting("site-name");
  const { data: settingsFromSessionProperties } =
    useGetSessionPropertiesQuery();
  const siteNameFromSessionProperties =
    settingsFromSessionProperties?.["site-name"];

  // we have a few different ways to access settings state
  // and we want to make sure they stay in sync
  return (
    <div>
      <div>{siteNameFromSelector}</div>
      <div>{siteNameFromHook}</div>
      <div>{siteNameFromSessionProperties}</div>
    </div>
  );
};

const TestComponentWithForceUpdateHook = () => {
  const { data: settings, isLoading } = useGetSettingsQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });

  const siteName = settings?.["site-name"];

  if (isLoading) {
    return <div>loading</div>;
  }

  return <div>{siteName}</div>;
};

const TestUpdateComponent = () => {
  const [showHiddenComponent, setShowHiddenComponent] = useState(false);
  const dispatch = useDispatch();
  const refresh = () => dispatch(refreshSiteSettings());
  const invalidate = () =>
    dispatch(sessionApi.util.invalidateTags(["session-properties"]));

  return (
    <div>
      <button onClick={() => refresh()}>refresh</button>
      <button onClick={() => invalidate()}>invalidate</button>
      <button onClick={() => () => setShowHiddenComponent(true)}>
        show force update component\
      </button>
      <TestGetComponent />
      {showHiddenComponent && <TestComponentWithForceUpdateHook />}
    </div>
  );
};

const setup = () => {
  setupPropertiesEndpoints(
    createMockSettings({ "site-name": "site name from API" }),
  );

  return renderWithProviders(<TestUpdateComponent />, {
    storeInitialState: {
      settings: createMockSettingsState({ "site-name": "initial site name" }),
    },
  });
};

describe("metabase/redux/settings", () => {
  it("should load settings from initial store", () => {
    setup();
    // will be loading if called from the api
    expect(screen.getAllByText("initial site name")).toHaveLength(2);
  });

  it("should load settings from API", async () => {
    setup();
    await waitFor(() =>
      expect(screen.getAllByText("site name from API")).toHaveLength(3),
    );
  });

  it("settings state should get refreshed by refreshSettings action", async () => {
    setup();

    await waitFor(() =>
      expect(screen.getAllByText("site name from API")).toHaveLength(3),
    );

    setupPropertiesEndpoints(
      createMockSettings({ "site-name": "updated site name" }),
    );

    // nothing should have changed
    expect(screen.getAllByText("site name from API")).toHaveLength(3);

    const refreshButton = screen.getByText("refresh");
    await userEvent.click(refreshButton);

    await waitFor(() =>
      expect(screen.getAllByText("updated site name")).toHaveLength(3),
    );
  });

  it("settings state should get refreshed by invalidating tags", async () => {
    setup();

    await waitFor(() =>
      expect(screen.getAllByText("site name from API")).toHaveLength(3),
    );

    setupPropertiesEndpoints(
      createMockSettings({ "site-name": "updated site name" }),
    );

    // nothing should have changed
    expect(screen.getAllByText("site name from API")).toHaveLength(3);

    const invalidateButton = screen.getByText("invalidate");
    await userEvent.click(invalidateButton);

    await waitFor(() =>
      expect(screen.getAllByText("updated site name")).toHaveLength(3),
    );
  });
});
