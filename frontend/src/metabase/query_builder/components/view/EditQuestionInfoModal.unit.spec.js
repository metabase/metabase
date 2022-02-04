import React from "react";
import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import userEvent from "@testing-library/user-event";
import xhrMock from "xhr-mock";
import { setupEnterpriseTest } from "__support__/enterprise";
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

function mockCachingSettings({ enabled = true } = {}) {
  const original = MetabaseSettings.get.bind(MetabaseSettings);
  const spy = jest.spyOn(MetabaseSettings, "get");
  spy.mockImplementation(key => {
    if (key === "enable-query-caching") {
      return enabled;
    }
    if (key === "query-caching-min-ttl") {
      return 10000;
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

function setup({ cachingEnabled = true } = {}) {
  mockCachingSettings({
    enabled: cachingEnabled,
  });

  const onSave = jest.fn();
  const onClose = jest.fn();

  const question = {
    card: () => QUESTION,
    database: () => ({
      cache_ttl: null,
    }),
    isDataset: () => true,
  };

  renderWithProviders(
    <EditQuestionInfoModal
      question={question}
      onSave={onSave}
      onClose={onClose}
    />,
  );

  return {
    onSave,
    onClose,
  };
}

function fillNumericInput(input, value) {
  userEvent.clear(input);
  userEvent.type(input, String(value));
  input.blur();
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
    const input = screen.getByLabelText("Caching");
    fillNumericInput(input, cache_ttl);
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

  it("calls onSave callback on successful update", () => {
    const UPDATES = {
      name: "New fancy question name",
      description: "Just testing if updates work correctly",
    };
    const { onSave } = setup();

    fillForm(UPDATES);
    fireEvent.click(screen.queryByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      ...QUESTION,
      ...UPDATES,
    });
  });

  describe("Cache TTL field", () => {
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

      describe("caching enabled", () => {
        it("is shown", () => {
          setup();
          fireEvent.click(screen.queryByText("More options"));
          expect(screen.getByDisplayValue("0")).toBeInTheDocument();
        });

        it("can be changed", () => {
          const { onSave } = setup();

          fireEvent.click(screen.queryByText("More options"));
          fillNumericInput(screen.getByDisplayValue("0"), 10);
          fireEvent.click(screen.queryByRole("button", { name: "Save" }));

          expect(onSave).toHaveBeenCalledWith({
            ...QUESTION,
            cache_ttl: 10,
          });
        });
      });

      describe("caching disabled", () => {
        it("is not shown if caching is disabled", () => {
          setup({ cachingEnabled: false });
          expect(screen.queryByText("More options")).not.toBeInTheDocument();
          expect(
            screen.queryByText("Cache all question results for"),
          ).not.toBeInTheDocument();
        });

        it("can still submit the form", () => {
          const { onSave } = setup({
            cachingEnabled: false,
          });

          fillForm({ name: "Test" });
          fireEvent.click(screen.queryByRole("button", { name: "Save" }));

          expect(onSave).toHaveBeenCalledWith({
            ...QUESTION,
            name: "Test",
          });
        });
      });
    });
  });
});
