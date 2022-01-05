import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMockDatabase, createMockUser } from "metabase-types/api/mocks";
import DatabaseSection from "./DatabaseSection";

describe("DatabaseSection", () => {
  it("should display databases", () => {
    const user = createMockUser();
    const databases = [createMockDatabase({ name: "Our database" })];

    render(<DatabaseSection user={user} databases={databases} showData />);

    expect(screen.getByText("Our data")).toBeInTheDocument();
    expect(screen.getByText("Our database")).toBeInTheDocument();
    expect(screen.queryByText("Add a database")).not.toBeInTheDocument();
  });

  it("should not be visible when hidden by the setting", () => {
    const user = createMockUser();
    const databases = [createMockDatabase({ name: "Our database" })];

    render(
      <DatabaseSection user={user} databases={databases} showData={false} />,
    );

    expect(screen.queryByText("Our data")).not.toBeInTheDocument();
    expect(screen.queryByText("Our database")).not.toBeInTheDocument();
  });

  it("should not be visible when hidden by the setting", () => {
    const user = createMockUser();
    const databases = [createMockDatabase({ name: "Our database" })];

    render(
      <DatabaseSection user={user} databases={databases} showData={false} />,
    );

    expect(screen.queryByText("Our data")).not.toBeInTheDocument();
    expect(screen.queryByText("Our database")).not.toBeInTheDocument();
  });

  it("should not be visible for regular users when there are no databases", () => {
    const user = createMockUser();

    render(<DatabaseSection user={user} databases={[]} showData />);

    expect(screen.queryByText("Our data")).not.toBeInTheDocument();
  });

  it("should be visible for admin users when there are no databases", () => {
    const user = createMockUser({ is_superuser: true });

    render(<DatabaseSection user={user} databases={[]} showData />);

    expect(screen.getByText("Our data")).toBeInTheDocument();
    expect(screen.getByText("Add a database")).toBeInTheDocument();
  });

  it("should allow admins to hide the section", () => {
    const user = createMockUser({ is_superuser: true });
    const onHideData = jest.fn();

    render(
      <DatabaseSection
        user={user}
        databases={[]}
        showData
        onHideData={onHideData}
      />,
    );

    userEvent.click(screen.getByLabelText("close icon"));
    userEvent.click(screen.getByText("Remove"));

    expect(onHideData).toHaveBeenCalled();
  });

  it("should not allow regular users to hide the section", () => {
    const user = createMockUser({ is_superuser: false });
    const onHideData = jest.fn();

    render(
      <DatabaseSection
        user={user}
        databases={[]}
        showData
        onHideData={onHideData}
      />,
    );

    expect(screen.queryByLabelText("close icon")).not.toBeInTheDocument();
  });
});
