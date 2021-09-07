import React from "react";
import _ from "underscore";
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

function setup({
  databaseCacheTTL = null,
  mockQuestionUpdateResponse = true,
} = {}) {
  const onSave = jest.fn();
  const onClose = jest.fn();

  const question = {
    card: () => QUESTION,
    database: () => ({
      cache_ttl: databaseCacheTTL,
    }),
  };

  if (mockQuestionUpdateResponse) {
    xhrMock.put(`/api/card/${QUESTION.id}`, (req, res) =>
      res.status(200).body(req.body()),
    );
  }

  render(
    <Provider store={getStore({ form })}>
      <EditQuestionInfoModal
        question={question}
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

function setupUpdateRequestAssertion(
  doneCallback,
  changedValues,
  { hasCacheTTLField = false } = {},
) {
  const editableFields = ["name", "description"];
  if (hasCacheTTLField) {
    editableFields.push("cache_ttl");
  }
  xhrMock.put(`/api/card/${QUESTION.id}`, req => {
    try {
      expect(JSON.parse(req.body())).toEqual({
        ..._.pick(QUESTION, ...editableFields),
        ...changedValues,
      });
      doneCallback();
    } catch (err) {
      doneCallback(err);
    }
  });
}

function fillForm({ name, description, cache_ttl } = {}) {
  if (name) {
    const input = screen.getByLabelText("Name");
    userEvent.clear(input);
    userEvent.type(input, name);
  }
  if (description) {
    const input = screen.getByLabelText("Description");
    userEvent.clear(input);
    userEvent.type(input, description);
  }
  if (cache_ttl) {
    const input = screen.getByLabelText("Cache TTL");
    userEvent.clear(input);
    userEvent.type(input, String(cache_ttl));
    input.blur();
  }
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

  it("submits an update request correctly", done => {
    const UPDATES = {
      name: "New fancy question name",
      description: "Just testing if updates work correctly",
    };
    setup({ mockQuestionUpdateResponse: false });
    fillForm(UPDATES);
    setupUpdateRequestAssertion(done, UPDATES);
    fireEvent.click(screen.queryByRole("button", { name: "Save" }));
  });

  it("calls onSave callback on successful update", async () => {
    const UPDATES = {
      name: "New fancy question name",
      description: "Just testing if updates work correctly",
    };
    const { onSave } = setup();

    fillForm(UPDATES);
    await act(async () => {
      await fireEvent.click(screen.queryByRole("button", { name: "Save" }));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      ...QUESTION,
      ...UPDATES,
    });
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

        it("shows database cache ttl as a default value if question's cache ttl is not set", () => {
          setup({ databaseCacheTTL: 48 });
          fireEvent.click(screen.queryByText("More options"));
          expect(screen.queryByLabelText("Cache TTL")).toHaveValue("48");
        });

        it("can be changed", done => {
          setup({ mockQuestionUpdateResponse: false });
          setupUpdateRequestAssertion(
            done,
            {
              cache_ttl: 10,
            },
            { hasCacheTTLField: true },
          );

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

        it("can still submit the form", done => {
          mockCachingEnabled(false);
          setup({ mockQuestionUpdateResponse: false });
          setupUpdateRequestAssertion(done, {
            name: "Test",
          });

          fillForm({ name: "Test" });
          fireEvent.click(screen.queryByRole("button", { name: "Save" }));
        });
      });
    });
  });
});
