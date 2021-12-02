import React from "react";
import { render, screen } from "@testing-library/react";
import StartSection from "./StartSection";

describe("StartSection", () => {
  it("should show pinned dashboards", () => {
    const user = getUser();
    const databases = [getDatabase()];
    const dashboards = [getDashboard({ name: "Stats" })];

    render(
      <StartSection
        user={user}
        databases={databases}
        dashboards={dashboards}
      />,
    );

    expect(screen.getByText("Start here")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
  });
});

const getUser = ({ is_superuser = false } = {}) => ({ is_superuser });

const getDatabase = ({ id = 1, is_sample = false } = {}) => ({ id, is_sample });

const getDashboard = ({ id = 1, name } = {}) => ({ id, name });
