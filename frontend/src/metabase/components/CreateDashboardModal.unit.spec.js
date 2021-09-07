import React from "react";
import { Provider } from "react-redux";
import { reducer as form } from "redux-form";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import xhrMock from "xhr-mock";
import { getStore } from "__support__/entities-store";
import MetabaseSettings from "metabase/lib/settings";
import { PLUGIN_CACHING } from "metabase/plugins";
import CreateDashboardModal from "./CreateDashboardModal";

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

  xhrMock.post(`/api/dashboard`, (req, res) =>
    res.status(200).body(req.body()),
  );

  render(
    <Provider store={getStore({ form })}>
      <CreateDashboardModal onClose={onClose} />
    </Provider>,
  );

  return {
    onClose,
  };
}

function fillForm({ name, description } = {}) {
  const nextDashboardState = {};
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
  return nextDashboardState;
}

describe("CreateDashboardModal", () => {
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

  it("displays empty form fields", () => {
    setup();

    expect(screen.queryByLabelText("Name")).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).toHaveValue("");

    expect(screen.queryByLabelText("Description")).toBeInTheDocument();
    expect(screen.queryByLabelText("Description")).toHaveValue("");

    expect(screen.queryByText("Our analytics")).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: "Create" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create" }),
    ).toBeInTheDocument();
  });

  it("can't submit if name is empty", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("calls onClose when Cancel button is clicked", () => {
    const { onClose } = setup();
    fireEvent.click(screen.queryByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("submits a create request correctly", () => {
    const FORM = {
      name: "New fancy dashboard",
      description: "Just testing the form",
    };
    setup();

    xhrMock.put(`/api/dashboard`, (req, res) => {
      expect(req.body()).toEqual(FORM);
      return res.status(200).body(req.body());
    });

    fillForm(FORM);
    fireEvent.click(screen.queryByRole("button", { name: "Create" }));
  });

  describe("Cache TTL field", () => {
    beforeEach(() => {
      mockCachingEnabled();
    });

    describe("OSS", () => {
      it("is not shown", () => {
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
          type: "integer",
        };
      });

      afterEach(() => {
        PLUGIN_CACHING.cacheTTLFormField = null;
      });

      it("is not shown", () => {
        setup();
        expect(screen.queryByText("More options")).not.toBeInTheDocument();
        expect(
          screen.queryByText("Cache all question results for"),
        ).not.toBeInTheDocument();
      });
    });
  });

  test.todo("navigates back to dashboard after an update");
});
