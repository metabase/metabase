import React from "react";
import { render, screen } from "@testing-library/react";
import {
  createMockDatabase,
  createMockDatabaseCandidate,
  createMockTableCandidate,
} from "metabase-types/api/mocks";
import HomeXraySection, { HomeXraySectionProps } from "./HomeXraySection";

describe("HomeXraySection", () => {
  it("should show x-rays for a sample database", () => {
    const props = getProps({
      database: createMockDatabase({
        is_sample: true,
      }),
      databaseCandidates: [
        createMockDatabaseCandidate({
          tables: [
            createMockTableCandidate({ title: "Orders" }),
            createMockTableCandidate({ title: "People" }),
          ],
        }),
      ],
    });

    render(<HomeXraySection {...props} />);

    expect(screen.getByText(/Try out these sample x-rays/)).toBeInTheDocument();
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("People")).toBeInTheDocument();
  });

  it("should show x-rays for a user database", () => {
    const props = getProps({
      database: createMockDatabase({
        name: "H2",
        is_sample: false,
      }),
      databaseCandidates: [
        createMockDatabaseCandidate({
          tables: [createMockTableCandidate({ title: "Orders" })],
        }),
        createMockDatabaseCandidate({
          tables: [createMockTableCandidate({ title: "People" })],
        }),
      ],
    });

    render(<HomeXraySection {...props} />);

    expect(screen.getByText(/Here are some explorations/)).toBeInTheDocument();
    expect(screen.getByText("H2")).toBeInTheDocument();
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("People")).toBeInTheDocument();
  });
});

const getProps = (
  opts?: Partial<HomeXraySectionProps>,
): HomeXraySectionProps => ({
  database: createMockDatabase(),
  databaseCandidates: [],
  ...opts,
});
