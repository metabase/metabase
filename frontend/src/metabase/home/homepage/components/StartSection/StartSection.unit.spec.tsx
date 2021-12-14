import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dashboard, Database, User } from "../../types";
import StartSection from "./StartSection";

describe("StartSection", () => {
  it("should show pinned dashboards", () => {
    const user = getUser();
    const databases = [getDatabase()];
    const dashboards = [getDashboard({ name: "Our dashboard" })];

    render(
      <StartSection
        user={user}
        databases={databases}
        dashboards={dashboards}
        showPinMessage={true}
      />,
    );

    expect(screen.getByText("Start here")).toBeInTheDocument();
    expect(screen.getByText("Our dashboard")).toBeInTheDocument();
    expect(screen.queryByText(/Connect your data/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Pin dashboards/)).not.toBeInTheDocument();
  });

  it("should show a banner for admins when there are no user databases", () => {
    const user = getUser({ is_superuser: true });
    const databases = [getDatabase({ is_sample: true })];
    const dashboards = [getDashboard({ name: "Our dashboard" })];

    render(
      <StartSection
        user={user}
        databases={databases}
        dashboards={dashboards}
        showPinMessage={true}
      />,
    );

    expect(screen.getByText("Start here")).toBeInTheDocument();
    expect(screen.getByText("Our dashboard")).toBeInTheDocument();
    expect(screen.getByText(/Connect your data/)).toBeInTheDocument();
    expect(screen.queryByText(/Pin dashboards/)).not.toBeInTheDocument();
  });

  it("should not show a banner for regular users when there are no user databases", () => {
    const user = getUser();
    const dashboards = [getDashboard({ name: "Our dashboard" })];

    render(
      <StartSection
        user={user}
        databases={[]}
        dashboards={dashboards}
        showPinMessage={true}
      />,
    );

    expect(screen.getByText("Start here")).toBeInTheDocument();
    expect(screen.getByText("Our dashboard")).toBeInTheDocument();
    expect(screen.queryByText(/Connect your data/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Pin dashboards/)).not.toBeInTheDocument();
  });

  it("should show a banner for admins when there are no pinned dashboards", () => {
    const user = getUser({ is_superuser: true });

    render(
      <StartSection
        user={user}
        databases={[]}
        dashboards={[]}
        showPinMessage={true}
      />,
    );

    expect(screen.getByText("Start here")).toBeInTheDocument();
    expect(screen.getByText(/Connect your data/)).toBeInTheDocument();
    expect(screen.queryByText(/Pin dashboards/)).not.toBeInTheDocument();
  });

  it("should show a banner for regular users when there are no pinned dashboards", () => {
    const user = getUser();

    render(
      <StartSection
        user={user}
        databases={[]}
        dashboards={[]}
        showPinMessage={true}
      />,
    );

    expect(screen.getByText("Start here")).toBeInTheDocument();
    expect(screen.queryByText(/Connect your data/)).not.toBeInTheDocument();
    expect(screen.getByText(/Pin dashboards/)).toBeInTheDocument();
  });

  it("should not hide the section for admins when there is no content", () => {
    const user = getUser({ is_superuser: true });

    render(
      <StartSection
        user={user}
        databases={[]}
        dashboards={[]}
        showPinMessage={false}
      />,
    );

    expect(screen.getByText("Start here")).toBeInTheDocument();
    expect(screen.getByText(/Connect your data/)).toBeInTheDocument();
  });

  it("should hide the section for regular users when there is no content", () => {
    const user = getUser();

    render(
      <StartSection
        user={user}
        databases={[]}
        dashboards={[]}
        showPinMessage={false}
      />,
    );

    expect(screen.queryByText("Start here")).not.toBeInTheDocument();
  });

  it("should allow admins to hide the dashboard banner", () => {
    const user = getUser({ is_superuser: true });
    const databases = [getDatabase()];
    const onHidePinMessage = jest.fn();

    render(
      <StartSection
        user={user}
        databases={databases}
        dashboards={[]}
        showPinMessage={true}
        onHidePinMessage={onHidePinMessage}
      />,
    );

    userEvent.click(screen.getByLabelText("close icon"));
    expect(onHidePinMessage).toHaveBeenCalled();
  });

  it("should not allow regular users to hide the dashboard banner", () => {
    const user = getUser();
    const databases = [getDatabase()];
    const onHidePinMessage = jest.fn();

    render(
      <StartSection
        user={user}
        databases={databases}
        dashboards={[]}
        showPinMessage={true}
        onHidePinMessage={onHidePinMessage}
      />,
    );

    expect(screen.queryByLabelText("close icon")).not.toBeInTheDocument();
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

const getDashboard = (opts?: Partial<Dashboard>): Dashboard => ({
  id: 1,
  name: "Our dashboard",
  ...opts,
});
