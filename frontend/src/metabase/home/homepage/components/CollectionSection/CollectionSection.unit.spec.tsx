import React from "react";
import { render, screen } from "@testing-library/react";
import { createCollection, createUser } from "metabase-types/api/mocks";
import CollectionSection from "./CollectionSection";

const CollectionListMock = () => <div>CollectionList</div>;

jest.mock("metabase/components/CollectionList", () => CollectionListMock);

describe("CollectionSection", () => {
  it("should display the list when there are non-personal collections", () => {
    const user = createUser({ personal_collection_id: 1 });
    const collections = [createCollection({ id: 2 })];

    render(<CollectionSection user={user} collections={collections} />);

    expect(screen.getByText("CollectionList")).toBeInTheDocument();
  });

  it("should display an empty state when there are no non-personal collections", () => {
    const user = createUser();
    const collections = [createCollection({ id: user.personal_collection_id })];

    render(<CollectionSection user={user} collections={collections} />);

    expect(screen.getByText(/Access dashboards/)).toBeInTheDocument();
  });

  it("should display a special empty state for admins", () => {
    const user = createUser({ is_superuser: true });
    const collections = [createCollection({ id: user.personal_collection_id })];

    render(<CollectionSection user={user} collections={collections} />);

    expect(screen.getByText(/Save dashboards/)).toBeInTheDocument();
  });
});
