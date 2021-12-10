import React from "react";
import { render, screen } from "@testing-library/react";
import ExploreSection from "./ExploreSection";
import { User, Database } from "../../types";

describe("ExploreSection", () => {
  it("should display a modal for a newly created database", () => {
    const user = getUser({ id: 1 });
    const databases = [
      getDatabase({ is_sample: true }),
      getDatabase({ creator_id: 1, initial_sync_status: "incomplete" }),
    ];
    const onHideExploreModal = jest.fn();

    render(
      <ExploreSection
        user={user}
        databases={databases}
        showXrays={true}
        showExploreModal={true}
        onHideExploreModal={onHideExploreModal}
      />,
    );

    expect(screen.getByText("Explore sample data")).toBeInTheDocument();
    expect(onHideExploreModal).toHaveBeenCalled();
  });

  it("should not display a modal when it was already shown", () => {
    const user = getUser({ id: 1 });
    const databases = [
      getDatabase({ is_sample: true }),
      getDatabase({ creator_id: 1, initial_sync_status: "incomplete" }),
    ];
    const onHideExploreModal = jest.fn();

    render(
      <ExploreSection
        user={user}
        databases={databases}
        showXrays={true}
        showExploreModal={false}
        onHideExploreModal={onHideExploreModal}
      />,
    );

    expect(screen.queryByText("Explore sample data")).not.toBeInTheDocument();
    expect(onHideExploreModal).not.toHaveBeenCalled();
  });

  it("should not display a modal when the user is not the database creator", () => {
    const user = getUser({ id: 1 });
    const databases = [
      getDatabase({ is_sample: true }),
      getDatabase({ creator_id: 2, initial_sync_status: "incomplete" }),
    ];
    const onHideExploreModal = jest.fn();

    render(
      <ExploreSection
        user={user}
        databases={databases}
        showXrays={true}
        showExploreModal={true}
        onHideExploreModal={onHideExploreModal}
      />,
    );

    expect(screen.queryByText("Explore sample data")).not.toBeInTheDocument();
    expect(onHideExploreModal).not.toHaveBeenCalled();
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
