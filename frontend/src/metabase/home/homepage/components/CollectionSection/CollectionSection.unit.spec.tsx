import React from "react";
import { render, screen } from "@testing-library/react";
import { Collection, User } from "../../types";
import CollectionSection from "./CollectionSection";

const CollectionListMock = () => <div>CollectionList</div>;

jest.mock("metabase/components/CollectionList", () => CollectionListMock);

describe("CollectionSection", () => {
  it("should display the list when there are non-personal collections", () => {
    const user = getUser();
    const collections = [getCollection()];

    render(<CollectionSection user={user} collections={collections} />);

    expect(screen.getByText("CollectionList")).toBeInTheDocument();
  });

  it("should display an empty state when there are no non-personal collections", () => {
    const user = getUser();
    const collections = [getCollection({ id: user.personal_collection_id })];

    render(<CollectionSection user={user} collections={collections} />);

    expect(screen.getByText(/Access dashboards/)).toBeInTheDocument();
  });

  it("should display a special empty state for admins", () => {
    const user = getUser({ is_superuser: true });
    const collections = [getCollection({ id: user.personal_collection_id })];

    render(<CollectionSection user={user} collections={collections} />);

    expect(screen.getByText(/Save dashboards/)).toBeInTheDocument();
  });
});

const getUser = (opts?: Partial<User>): User => ({
  id: 1,
  first_name: "John",
  is_superuser: false,
  personal_collection_id: "personal",
  ...opts,
});

const getCollection = (opts?: Partial<Collection>): Collection => ({
  id: "root",
  ...opts,
});
