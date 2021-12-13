import React from "react";
import { render, screen } from "@testing-library/react";
import SyncingSection from "./SyncingSection";
import { User, Database } from "../../types";

describe("SyncingSection", () => {
  it("should display a modal for a syncing database", () => {
    const user = getUser({ id: 1 });
    const databases = [
      getDatabase({ is_sample: true }),
      getDatabase({ creator_id: 1, initial_sync_status: "incomplete" }),
    ];
    const onHideSyncingModal = jest.fn();

    render(
      <SyncingSection
        user={user}
        databases={databases}
        showXrays={true}
        showSyncingModal={true}
        onHideSyncingModal={onHideSyncingModal}
      />,
    );

    expect(screen.getByText("Explore sample data")).toBeInTheDocument();
    expect(onHideSyncingModal).toHaveBeenCalled();
  });

  it("should not display the modal when it was already shown", () => {
    const user = getUser({ id: 1 });
    const databases = [
      getDatabase({ is_sample: true }),
      getDatabase({ creator_id: 1, initial_sync_status: "incomplete" }),
    ];
    const onHideSyncingModal = jest.fn();

    render(
      <SyncingSection
        user={user}
        databases={databases}
        showXrays={true}
        showSyncingModal={false}
        onHideSyncingModal={onHideSyncingModal}
      />,
    );

    expect(screen.queryByText("Explore sample data")).not.toBeInTheDocument();
    expect(onHideSyncingModal).not.toHaveBeenCalled();
  });

  it("should not display the modal when the user is not the database creator", () => {
    const user = getUser({ id: 1 });
    const databases = [
      getDatabase({ is_sample: true }),
      getDatabase({ creator_id: 2, initial_sync_status: "incomplete" }),
    ];
    const onHideSyncingModal = jest.fn();

    render(
      <SyncingSection
        user={user}
        databases={databases}
        showXrays={true}
        showSyncingModal={true}
        onHideSyncingModal={onHideSyncingModal}
      />,
    );

    expect(screen.queryByText("Explore sample data")).not.toBeInTheDocument();
    expect(onHideSyncingModal).not.toHaveBeenCalled();
  });
});

const getUser = (opts?: Partial<User>): User => ({
  id: 1,
  first_name: "John",
  is_superuser: false,
  personal_collection_id: "personal",
  ...opts,
});

const getDatabase = (opts?: Partial<Database>): Database => ({
  id: 1,
  name: "Our database",
  is_sample: false,
  initial_sync_status: "complete",
  ...opts,
});
