import React from "react";
import { Provider } from "react-redux";
import { reducer as form } from "redux-form";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import xhrMock from "xhr-mock";
import { getStore } from "__support__/entities-store";
import { PLUGIN_CACHING } from "metabase/plugins";
import MetabaseSettings from "metabase/lib/settings";
import EditQuestionInfoModal from "./EditQuestionInfoModal";

const QUESTION = {
  id: 1,
  name: "Question",
  description: "I'm here for your unit tests",
  collection_id: null,
  cache_ttl: 0,
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

  it("calls onSave callback on successful update", async () => {
    const UPDATES = {
      name: "New fancy question name",
      description: "Just testing if updates work correctly",
    };
    const { onSave } = setup();

    const question = fillForm(UPDATES);
    await act(async () => {
      await fireEvent.click(screen.queryByRole("button", { name: "Save" }));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(question);
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
        mockCachingEnabled();
      });

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
        it("is shown", () => {
          setup();
          fireEvent.click(screen.queryByText("More options"));
          expect(screen.queryByLabelText("Cache TTL")).toHaveValue("0");
        });

        it("can be changed", () => {
          setup();

          xhrMock.put(`/api/card/${QUESTION.id}`, (req, res) => {
            expect(req.body()).toEqual({
              ...QUESTION,
              cache_ttl: 10,
            });
            return res.status(200).body(req.body());
          });

          fireEvent.click(screen.queryByText("More options"));
          fillForm({ cache_ttl: 10 });
          fireEvent.click(screen.queryByRole("button", { name: "Save" }));
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

          xhrMock.put(`/api/card/${QUESTION.id}`, (req, res) => {
            expect(req.body()).toEqual({
              ...QUESTION,
              name: "Test",
            });
            return res.status(200).body(req.body());
          });

          fillForm({ name: "Test" });
          fireEvent.click(screen.queryByRole("button", { name: "Save" }));
        });
      });
    });
  });
});
