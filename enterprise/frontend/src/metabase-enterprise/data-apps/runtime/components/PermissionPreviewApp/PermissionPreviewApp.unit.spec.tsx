import userEvent from "@testing-library/user-event";
import { useEffect } from "react";

import { renderWithProviders, screen } from "__support__/ui";
import { useSdkBreadcrumbs } from "embedding-sdk-bundle/hooks/private/use-sdk-breadcrumb";
import type { MetabaseCollectionItem } from "embedding-sdk-bundle/types/collection";

import { PreviewContent } from "./PermissionPreviewApp";

// The SDK's collection browser, as it behaves under its breadcrumbs: it reports where it is, and moves where they say.
jest.mock("embedding-sdk-package", () => ({
  CollectionBrowser: function CollectionBrowserStub({
    onClick,
  }: {
    onClick?: (item: MetabaseCollectionItem) => void;
  }) {
    const { currentLocation, reportLocation } = useSdkBreadcrumbs();
    useEffect(() => {
      if (currentLocation == null) {
        reportLocation({
          type: "all-collections",
          id: "all",
          name: "All collections",
        });
      }
    }, [currentLocation, reportLocation]);
    return (
      <div>
        <button
          onClick={() => {
            onClick?.({
              id: 14,
              name: "Sales reports",
              model: "collection",
              description: null,
            });
            reportLocation({
              type: "collection",
              id: 14,
              name: "Sales reports",
            });
          }}
        >
          Sales reports
        </button>
        <button
          onClick={() =>
            onClick?.({
              id: 12,
              name: "Sales overview",
              model: "dashboard",
              description: null,
            })
          }
        >
          Sales overview
        </button>
      </div>
    );
  },
  InteractiveDashboard: function InteractiveDashboardStub() {
    return <div>Dashboard content</div>;
  },
  InteractiveQuestion: function InteractiveQuestionStub() {
    return <div>Question content</div>;
  },
}));

describe("PreviewContent", () => {
  it("reports the top of the collection browser as All collections", () => {
    const { onLocationChange } = setup();

    expect(onLocationChange).toHaveBeenLastCalledWith("/");
  });

  it("reports each collection the browser opens", async () => {
    const { onLocationChange } = setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Sales reports" }),
    );

    expect(onLocationChange).toHaveBeenLastCalledWith("/collection/14");
    expect(
      screen.getByRole("button", { name: "Sales overview" }),
    ).toBeVisible();
  });

  it("reports going back up by the breadcrumbs", async () => {
    const { onLocationChange } = setup();
    await userEvent.click(
      screen.getByRole("button", { name: "Sales reports" }),
    );

    await userEvent.click(screen.getByText("All collections"));

    expect(onLocationChange).toHaveBeenLastCalledWith("/");
  });

  it("reports the dashboard opened, then the collection it was opened from on the way back", async () => {
    const { onLocationChange } = setup();
    await userEvent.click(
      screen.getByRole("button", { name: "Sales reports" }),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Sales overview" }),
    );
    expect(onLocationChange).toHaveBeenLastCalledWith("/dashboard/12");

    await userEvent.click(
      screen.getByRole("button", { name: /Back to collections/ }),
    );
    expect(onLocationChange).toHaveBeenLastCalledWith("/collection/14");
  });
});

function setup() {
  const onLocationChange = jest.fn<void, [string]>();
  renderWithProviders(<PreviewContent onLocationChange={onLocationChange} />);
  return { onLocationChange };
}
