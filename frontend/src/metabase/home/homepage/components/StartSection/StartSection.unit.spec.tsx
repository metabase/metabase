import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createDashboard,
  createDatabase,
  createUser,
} from "metabase-types/api";
import StartSection from "./StartSection";

describe("StartSection", () => {
  it("should show pinned dashboards", () => {
    const user = createUser();
    const databases = [createDatabase()];
    const dashboards = [createDashboard({ name: "Our dashboard" })];

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
    const user = createUser({ is_superuser: true });
    const databases = [createDatabase({ is_sample: true })];
    const dashboards = [createDashboard({ name: "Our dashboard" })];

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
    const user = createUser();
    const dashboards = [createDashboard({ name: "Our dashboard" })];

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
    const user = createUser({ is_superuser: true });

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
    const user = createUser();

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
    const user = createUser({ is_superuser: true });

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
    const user = createUser();

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
    const user = createUser({ is_superuser: true });
    const databases = [createDatabase()];
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
    const user = createUser();
    const databases = [createDatabase()];
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
