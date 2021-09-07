import React from "react";
import { Provider } from "react-redux";
import { reducer as form } from "redux-form";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import xhrMock from "xhr-mock";
import { getStore } from "__support__/entities-store";
import MetabaseSettings from "metabase/lib/settings";
import { PLUGIN_CACHING } from "metabase/plugins";
import DashboardDetailsModal from "./DashboardDetailsModal";

const DASHBOARD = {
  id: 1,
  name: "Dashboard",
  description: "I'm here for your unit tests",
  cache_ttl: 0,
  collection_id: null,
  ordered_cards: [],
  archived: false,
};

function mockCachingEnabled(enabled = true) {
  const original = MetabaseSettings.get;
  const spy = jest.spyOn(MetabaseSettings, "get");
  spy.mockImplementation(key => {
    if (key === "enable-query-caching") {
      return enabled;
    }
    return original(key);
  });
}

function setup() {
  const onClose = jest.fn();

  xhrMock.put(`/api/dashboard/${DASHBOARD.id}`, (req, res) =>
    res.status(200).body(req.body()),
  );

  const dashboardReducer = () => ({
    dashboardId: DASHBOARD.id,
    dashboards: {
      [DASHBOARD.id]: DASHBOARD,
    },
  });

  render(
    <Provider store={getStore({ form, dashboard: dashboardReducer })}>
      <DashboardDetailsModal onClose={onClose} />
    </Provider>,
  );

  return {
    onClose,
  };
}

function fillForm({ name, description, cache_ttl } = {}) {
  const nextDashboardState = { ...DASHBOARD };
  if (name) {
    const input = screen.getByLabelText("Name");
    userEvent.clear(input);
    userEvent.type(input, name);
    nextDashboardState.name = name;
  }
  if (description) {
    const input = screen.getByLabelText("Description");
    userEvent.clear(input);
    userEvent.type(input, description);
    nextDashboardState.description = description;
  }
  if (cache_ttl) {
    const input = screen.getByLabelText("Cache TTL");
    userEvent.clear(input);
    userEvent.type(input, cache_ttl);
    nextDashboardState.cache_ttl = cache_ttl;
  }
  return nextDashboardState;
}

describe("DashboardDetailsModal", () => {
  beforeEach(() => {
    xhrMock.setup();
    xhrMock.get("/api/collection", {
      body: JSON.stringify([
        {
          id: "root",
          name: "Our analytics",
          can_write: true,
        },
      ]),
    });
  });

  afterEach(() => {
    xhrMock.teardown();
  });

  it("displays fields with filled values", () => {
    setup();

    expect(screen.queryByLabelText("Name")).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).toHaveValue(DASHBOARD.name);

    expect(screen.queryByLabelText("Description")).toBeInTheDocument();
    expect(screen.queryByLabelText("Description")).toHaveValue(
      DASHBOARD.description,
    );

    expect(screen.queryByText("Our analytics")).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: "Update" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancel" }),
    ).toBeInTheDocument();
  });

  it("calls onClose when Cancel button is clicked", () => {
    const { onClose } = setup();
    fireEvent.click(screen.queryByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("can't submit if name is empty", () => {
    setup();

    fillForm({ name: "" });
    fireEvent.click(screen.queryByRole("button", { name: "Update" }));

    expect(screen.queryByRole("button", { name: "Update" })).toBeDisabled();
  });

  it("submits an update request correctly", () => {
    const UPDATES = {
      name: "New fancy dashboard name",
      description: "Just testing if updates work correctly",
    };
    setup();

    xhrMock.put(`/api/dashboard/${DASHBOARD.id}`, (req, res) => {
      expect(req.body()).toEqual({
        ...DASHBOARD,
        ...UPDATES,
      });
      return res.status(200).body(req.body());
    });

    fillForm(UPDATES);
    fireEvent.click(screen.queryByRole("button", { name: "Update" }));
  });

  describe("Cache TTL field", () => {
    describe("OSS", () => {
      it("is not shown", () => {
        mockCachingEnabled();
        setup();
        expect(screen.queryByText("More options")).not.toBeInTheDocument();
        expect(
          screen.queryByText("Cache all question results for"),
        ).not.toBeInTheDocument();
      });
    });

    describe("EE", () => {
      beforeEach(() => {
        PLUGIN_CACHING.cacheTTLFormField = {
          name: "cache_ttl",
          title: "Cache TTL",
          type: "integer",
        };
      });

      afterEach(() => {
        PLUGIN_CACHING.cacheTTLFormField = null;
      });

      describe("caching enabled", () => {
        beforeEach(() => {
          mockCachingEnabled();
        });

        it("is shown", () => {
          setup();
          fireEvent.click(screen.queryByText("More options"));
          expect(screen.queryByLabelText("Cache TTL")).toHaveValue("0");
        });

        it("can be changed", () => {
          setup();

          xhrMock.put(`/api/dashboard/${DASHBOARD.id}`, (req, res) => {
            expect(req.body()).toEqual({
              ...DASHBOARD,
              cache_ttl: 10,
            });
            return res.status(200).body(req.body());
          });

          fireEvent.click(screen.queryByText("More options"));
          fillForm({ cache_ttl: 10 });
          fireEvent.click(screen.queryByRole("button", { name: "Update" }));
        });
      });

      describe("caching disabled", () => {
        it("is not shown if caching is disabled", () => {
          mockCachingEnabled(false);
          setup();
          expect(screen.queryByText("More options")).not.toBeInTheDocument();
          expect(
            screen.queryByText("Cache all question results for"),
          ).not.toBeInTheDocument();
        });

        it("can still submit the form", () => {
          setup();

          xhrMock.put(`/api/dashboard/${DASHBOARD.id}`, (req, res) => {
            expect(req.body()).toEqual({
              ...DASHBOARD,
              name: "Test",
            });
            return res.status(200).body(req.body());
          });

          fillForm({ name: "Test" });
          fireEvent.click(screen.queryByRole("button", { name: "Update" }));
        });
      });
    });
  });

  test.todo("navigates back to dashboard after an update");
});
