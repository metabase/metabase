import React from "react";
import { Provider } from "react-redux";
import { reducer as form } from "redux-form";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import xhrMock from "xhr-mock";
import { getStore } from "__support__/entities-store";
import CreateDashboardModal from "./CreateDashboardModal";

function setup() {
  const onClose = jest.fn();
  const mockOnChangeLocation = jest.fn();
  const setDashboardAttributes = jest.fn();

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
    onChangeLocation: mockOnChangeLocation,
    setDashboardAttributes,
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

  test.todo("navigates back to dashboard after an update");
});
