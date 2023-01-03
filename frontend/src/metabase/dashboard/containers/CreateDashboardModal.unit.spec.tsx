import React from "react";
import userEvent from "@testing-library/user-event";
import nock from "nock";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
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
    nock(location.origin)
      .post(`/api/dashboard`)
      .reply(200, (url, body) => body);
  }

  renderWithProviders(<CreateDashboardModal onClose={onClose} />);

  return {
    onClose,
  };
}

describe("CreateDashboardModal", () => {
  beforeEach(() => {
    nock(location.origin)
      .get("/api/collection")
      .reply(200, [
        {
          id: "root",
          name: "Our analytics",
          can_write: true,
        },
      ]);
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
    const submitButton = await waitFor(() =>
      screen.getByRole("button", { name: "Create" }),
    );
    expect(submitButton).toBeDisabled();
  });

  it("calls onClose when Cancel button is clicked", () => {
    const { onClose } = setup();
    userEvent.click(screen.getByRole("button", { name: "Cancel" }) as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
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
