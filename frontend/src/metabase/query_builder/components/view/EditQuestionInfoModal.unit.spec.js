import React from "react";
import { Provider } from "react-redux";
import { reducer as form } from "redux-form";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import xhrMock from "xhr-mock";
import { getStore } from "__support__/entities-store";
import EditQuestionInfoModal from "./EditQuestionInfoModal";

const QUESTION = {
  id: 1,
  name: "Question",
  description: "I'm here for your unit tests",
  collection_id: null,
  archived: false,
};

function setup() {
  const onSave = jest.fn();
  const onClose = jest.fn();

  xhrMock.put(`/api/card/${QUESTION.id}`, (req, res) =>
    res.status(200).body(req.body()),
  );

  render(
    <Provider store={getStore({ form })}>
      <EditQuestionInfoModal
        question={{ card: () => QUESTION }}
        onSave={onSave}
        onClose={onClose}
      />
    </Provider>,
  );

  return {
    onSave,
    onClose,
  };
}

function fillForm({ name, description } = {}) {
  const nextQuestionState = { ...QUESTION };
  if (name) {
    const input = screen.getByLabelText("Name");
    userEvent.clear(input);
    userEvent.type(input, name);
    nextQuestionState.name = name;
  }
  if (description) {
    const input = screen.getByLabelText("Description");
    userEvent.clear(input);
    userEvent.type(input, description);
    nextQuestionState.description = description;
  }
  return nextQuestionState;
}

describe("EditQuestionInfoModal", () => {
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
    expect(screen.queryByLabelText("Name")).toHaveValue(QUESTION.name);

    expect(screen.queryByLabelText("Description")).toBeInTheDocument();
    expect(screen.queryByLabelText("Description")).toHaveValue(
      QUESTION.description,
    );

    expect(screen.queryByRole("button", { name: "Save" })).toBeInTheDocument();
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
    fireEvent.click(screen.queryByRole("button", { name: "Save" }));

    expect(screen.queryByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("submits an update request correctly", () => {
    const UPDATES = {
      name: "New fancy question name",
      description: "Just testing if updates work correctly",
    };
    setup();

    xhrMock.put(`/api/card/${QUESTION.id}`, (req, res) => {
      expect(req.body()).toEqual({
        ...QUESTION,
        ...UPDATES,
      });
      return res.status(200).body(req.body());
    });

    fillForm(UPDATES);
    fireEvent.click(screen.queryByRole("button", { name: "Save" }));
  });

  it("calls onSave callback on successful update", () => {
    const UPDATES = {
      name: "New fancy question name",
      description: "Just testing if updates work correctly",
    };
    const { onSave } = setup();

    const question = fillForm(UPDATES);
    fireEvent.click(screen.queryByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(question);
  });
});
