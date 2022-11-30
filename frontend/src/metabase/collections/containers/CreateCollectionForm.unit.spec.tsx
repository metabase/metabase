import React from "react";
import userEvent from "@testing-library/user-event";
import xhrMock from "xhr-mock";

import { renderWithProviders, screen } from "__support__/ui";
import { setupEnterpriseTest } from "__support__/enterprise";

import { User } from "metabase-types/api";
import { createMockCollection, createMockUser } from "metabase-types/api/mocks";

import CreateCollectionForm from "./CreateCollectionForm";

type SetupOpts = {
  user?: User;
  onCancel?: (() => void) | null;
};

function setup({ user, onCancel = jest.fn() }: SetupOpts = {}) {
  xhrMock.post("/api/collection", (req, res) =>
    res.status(200).body(createMockCollection(req.body())),
  );

  renderWithProviders(<CreateCollectionForm onCancel={onCancel} />, {
    currentUser: user,
  });

  return { onCancel };
}

describe("CreateCollectionForm", () => {
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

  it("displays correct blank state", () => {
    setup();

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("");

    expect(screen.getByLabelText("Description")).toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toHaveValue("");

    expect(screen.getByText(/Collection it's saved in/i)).toBeInTheDocument();
    expect(screen.getByText("Our analytics")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });

  it("can't submit if name is empty", () => {
    setup();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("doesn't show cancel button if onCancel props is not set", () => {
    setup({ onCancel: null });
    expect(
      screen.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
  });

  it("calls onCancel when cancel button is clicked", () => {
    const { onCancel } = setup();
    userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  describe("Collection authority level", () => {
    describe("Free plan", () => {
      it("is not shown", () => {
        setup();
        expect(
          screen.queryByLabelText(/Collection type/i),
        ).not.toBeInTheDocument();
      });
    });

    describe("Paid plan", () => {
      beforeEach(() => {
        setupEnterpriseTest();
      });

      it("is shown", async () => {
        setup();
        expect(await screen.findByText(/Collection type/i)).toBeInTheDocument();
        expect(screen.getByText(/Regular/i)).toBeInTheDocument();
        expect(screen.getByText(/Official/i)).toBeInTheDocument();
      });

      it("isn't shown if user is not admin", async () => {
        setup({ user: createMockUser({ is_superuser: false }) });
        expect(screen.queryByText(/Collection type/i)).not.toBeInTheDocument();
      });
    });
  });
});
