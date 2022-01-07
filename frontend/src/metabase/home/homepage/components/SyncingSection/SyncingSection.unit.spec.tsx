import React from "react";
import { render, screen } from "@testing-library/react";
import SyncingSection from "./SyncingSection";
import { createMockDatabase, createMockUser } from "metabase-types/api/mocks";

const SyncingModal = () => <div>Explore sample data</div>;
jest.mock("metabase/containers/SyncingModal", () => SyncingModal);

describe("SyncingSection", () => {
  it("should display a modal for a syncing database", () => {
    const user = createMockUser({ id: 1 });
    const databases = [
      createMockDatabase({ is_sample: true }),
      createMockDatabase({ creator_id: 1, initial_sync_status: "incomplete" }),
    ];
    const onHideSyncingModal = jest.fn();

    render(
      <SyncingSection
        user={user}
        databases={databases}
        showSyncingModal={true}
        onHideSyncingModal={onHideSyncingModal}
      />,
    );

    expect(screen.getByText("Explore sample data")).toBeInTheDocument();
    expect(onHideSyncingModal).toHaveBeenCalled();
  });

  it("should not display the modal when it was already shown", () => {
    const user = createMockUser({ id: 1 });
    const databases = [
      createMockDatabase({ is_sample: true }),
      createMockDatabase({ creator_id: 1, initial_sync_status: "incomplete" }),
    ];
    const onHideSyncingModal = jest.fn();

    render(
      <SyncingSection
        user={user}
        databases={databases}
        showSyncingModal={false}
        onHideSyncingModal={onHideSyncingModal}
      />,
    );

    expect(screen.queryByText("Explore sample data")).not.toBeInTheDocument();
    expect(onHideSyncingModal).not.toHaveBeenCalled();
  });

  it("should not display the modal when the user is not the database creator", () => {
    const user = createMockUser({ id: 1 });
    const databases = [
      createMockDatabase({ is_sample: true }),
      createMockDatabase({ creator_id: 2, initial_sync_status: "incomplete" }),
    ];
    const onHideSyncingModal = jest.fn();

    render(
      <SyncingSection
        user={user}
        databases={databases}
        showSyncingModal={true}
        onHideSyncingModal={onHideSyncingModal}
      />,
    );

    expect(screen.queryByText("Explore sample data")).not.toBeInTheDocument();
    expect(onHideSyncingModal).not.toHaveBeenCalled();
  });
});
