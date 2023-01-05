import React from "react";
import userEvent from "@testing-library/user-event";
import nock from "nock";

import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { setupEnterpriseTest } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";

import type { Collection } from "metabase-types/api";
import { createMockEntitiesState } from "metabase-types/store/mocks";

import CreateDashboardModal from "./CreateDashboardModal";

const ROOT_COLLECTION = {
  id: "root",
  name: "Our analytics",
  can_write: true,
} as Collection;

function setup({
  isCachingEnabled = false,
  mockCreateDashboardResponse = true,
} = {}) {
  const onClose = jest.fn();

  const settings = mockSettings({ "enable-query-caching": isCachingEnabled });

  if (mockCreateDashboardResponse) {
    nock(location.origin)
      .post(`/api/dashboard`)
      .reply(200, (url, body) => body);
  }

  renderWithProviders(<CreateDashboardModal onClose={onClose} />, {
    storeInitialState: {
      entities: createMockEntitiesState({
        collections: {
          root: ROOT_COLLECTION,
        },
      }),
      settings,
    },
  });

  return {
    onClose,
  };
}

describe("CreateDashboardModal", () => {
  beforeEach(() => {
    nock(location.origin).get("/api/collection").reply(200, [ROOT_COLLECTION]);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it("displays empty form fields", () => {
    setup();

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("");

    expect(screen.getByLabelText("Description")).toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toHaveValue("");

    expect(screen.getByText("Our analytics")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });

  it("can't submit if name is empty", async () => {
    setup();
    expect(
      await screen.findByRole("button", { name: "Create" }),
    ).toBeDisabled();
  });

  it("calls onClose when Cancel button is clicked", async () => {
    const { onClose } = setup();
    await act(async () => {
      await userEvent.click(
        screen.getByRole("button", { name: "Cancel" }) as Element,
      );
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe("Cache TTL field", () => {
    describe("OSS", () => {
      it("is not shown", () => {
        setup({ isCachingEnabled: true });
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
        setup({ isCachingEnabled: true });
        expect(screen.queryByText("More options")).not.toBeInTheDocument();
        expect(
          screen.queryByText("Cache all question results for"),
        ).not.toBeInTheDocument();
      });
    });
  });
});
