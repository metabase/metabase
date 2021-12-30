import React from "react";
import _ from "underscore";
import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import userEvent from "@testing-library/user-event";
import xhrMock from "xhr-mock";
import { setupEnterpriseTest } from "__support__/enterprise";
import MetabaseSettings from "metabase/lib/settings";
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
  const original = MetabaseSettings.get.bind(MetabaseSettings);
  const spy = jest.spyOn(MetabaseSettings, "get");
  spy.mockImplementation(key => {
    if (key === "enable-query-caching") {
      return enabled;
    }
    if (key === "application-name") {
      return "Test Metabase";
    }
    return original(key);
  });
}

function setup({ mockDashboardUpdateResponse = true } = {}) {
  const onClose = jest.fn();

  if (mockDashboardUpdateResponse) {
    xhrMock.put(`/api/dashboard/${DASHBOARD.id}`, (req, res) =>
      res.status(200).body(req.body()),
    );
  }

  const dashboardReducer = () => ({
    dashboardId: DASHBOARD.id,
    dashboards: {
      [DASHBOARD.id]: DASHBOARD,
    },
  });

  renderWithProviders(<DashboardDetailsModal onClose={onClose} />, {
    reducers: {
      dashboard: dashboardReducer,
    },
  });

  return {
    onClose,
  };
}

function setupUpdateRequestAssertion(
  doneCallback,
  changedValues,
  { hasCacheTTLField = false } = {},
) {
  const editableFields = ["name", "description", "collection_id"];
  if (hasCacheTTLField) {
    editableFields.push("cache_ttl");
  }
  xhrMock.put(`/api/dashboard/${DASHBOARD.id}`, req => {
    try {
      expect(JSON.parse(req.body())).toEqual({
        ..._.pick(DASHBOARD, ...editableFields),
        ...changedValues,
      });
      doneCallback();
    } catch (err) {
      doneCallback(err);
    }
  });
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
    const input = screen.getByTestId("cache-ttl-input");
    userEvent.clear(input);
    userEvent.type(input, String(cache_ttl));
    input.blur();
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

  it("submits an update request correctly", done => {
    const UPDATES = {
      name: "New fancy dashboard name",
      description: "Just testing if updates work correctly",
    };
    setup({ mockDashboardUpdateResponse: false });
    setupUpdateRequestAssertion(done, UPDATES);

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
        setupEnterpriseTest();
      });

      describe("caching enabled", () => {
        beforeEach(() => {
          mockCachingEnabled();
        });

        it("is shown", () => {
          setup();
          fireEvent.click(screen.queryByText("More options"));
          expect(screen.queryByTestId("cache-ttl-input")).toHaveValue("0");
        });

        it("can be changed", done => {
          setup({ mockDashboardUpdateResponse: false });
          setupUpdateRequestAssertion(
            done,
            { cache_ttl: 10 },
            { hasCacheTTLField: true },
          );

          fireEvent.click(screen.queryByText("More options"));
          fillForm({ cache_ttl: 10 });
          fireEvent.click(screen.queryByRole("button", { name: "Update" }));
        });
      });

      describe("caching disabled", () => {
        beforeEach(() => {
          mockCachingEnabled(false);
        });

        it("is not shown if caching is disabled", () => {
          setup();
          expect(screen.queryByText("More options")).not.toBeInTheDocument();
          expect(
            screen.queryByText("Cache all question results for"),
          ).not.toBeInTheDocument();
        });

        it("can still submit the form", done => {
          setup({ mockDashboardUpdateResponse: false });
          setupUpdateRequestAssertion(done, { name: "Test" });

          fillForm({ name: "Test" });
          fireEvent.click(screen.queryByRole("button", { name: "Update" }));
        });
      });
    });
  });
});
