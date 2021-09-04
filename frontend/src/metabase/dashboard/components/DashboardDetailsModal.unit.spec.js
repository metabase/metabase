import React from "react";
import { Provider } from "react-redux";
import { reducer as form } from "redux-form";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import xhrMock from "xhr-mock";
import { getStore } from "__support__/entities-store";
import DashboardDetailsModal from "./DashboardDetailsModal";

const DASHBOARD = {
  id: 1,
  name: "Dashboard",
  description: "I'm here for your unit tests",
  collection_id: null,
  ordered_cards: [],
  archived: false,
};

function setup() {
  const onClose = jest.fn();
  const mockOnChangeLocation = jest.fn();
  const setDashboardAttributes = jest.fn();

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
    onChangeLocation: mockOnChangeLocation,
    setDashboardAttributes,
  };
}

function fillForm({ name, description } = {}) {
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

  test.todo("navigates back to dashboard after an update");
});
