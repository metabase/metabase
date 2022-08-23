import React from "react";
import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import userEvent from "@testing-library/user-event";
import xhrMock from "xhr-mock";
import { setupEnterpriseTest } from "__support__/enterprise";
import MetabaseSettings from "metabase/lib/settings";
import CreateDashboardModal from "./CreateDashboardModal";

function mockCachingEnabled(enabled = true) {
  const original = MetabaseSettings.get.bind(MetabaseSettings);
  const spy = jest.spyOn(MetabaseSettings, "get");
  spy.mockImplementation(key => {
    if (key === "enable-query-caching") {
      return enabled;
    }
    if (key === "application-name") {
      return "Metabase Test";
    }
    if (key === "version") {
      return { tag: "" };
    }
    if (key === "is-hosted?") {
      return false;
    }
    if (key === "enable-enhancements?") {
      return false;
    }
    return original(key);
  });
}

function setup({ mockCreateDashboardResponse = true } = {}) {
  const onClose = jest.fn();

  if (mockCreateDashboardResponse) {
    xhrMock.post(`/api/dashboard`, (req, res) =>
      res.status(200).body(req.body()),
    );
  }

  renderWithProviders(<CreateDashboardModal onClose={onClose} />);

  return {
    onClose,
  };
}

function setupCreateRequestAssertion(doneCallback, changedValues) {
  xhrMock.post("/api/dashboard", req => {
    try {
      expect(JSON.parse(req.body())).toEqual({
        ...changedValues,
        collection_id: null,
      });
      doneCallback();
    } catch (err) {
      doneCallback(err);
    }
  });
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

  it("can't submit if name is empty", async () => {
    setup();
    const submitButton = await waitFor(() =>
      screen.queryByRole("button", { name: "Create" }),
    );
    expect(submitButton).toBeDisabled();
  });

  it("calls onClose when Cancel button is clicked", () => {
    const { onClose } = setup();
    fireEvent.click(screen.queryByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("submits a create request correctly", done => {
    const FORM = {
      name: "New fancy dashboard",
      description: "Just testing the form",
    };
    setupCreateRequestAssertion(done, FORM);
    setup({ mockCreateDashboardResponse: false });

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
        setupEnterpriseTest();
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
});
