import React from "react";
import { render, screen } from "@testing-library/react";
import { createMockEngine } from "metabase-types/api/mocks";
import DriverWarning from "./DriverWarning";

describe("DriverWarning", () => {
  const engines = {
    postgres: createMockEngine({
      "driver-name": "PostgreSQL",
    }),
    presto: createMockEngine({
      "driver-name": "Presto (Deprecated Driver)",
      "superseded-by": "presto-jdbc",
    }),
    "presto-jdbc": createMockEngine({
      "driver-name": "Presto",
    }),
  };

  it("should render a warning when the driver is deprecated", () => {
    render(<DriverWarning engine="presto" engines={engines} />);
    expect(screen.getByText(/This driver will be removed/)).toBeInTheDocument();
  });

  it("should render a warning when the driver is new", () => {
    render(<DriverWarning engine="presto-jdbc" engines={engines} />);
    expect(screen.getByText(/This is our new Presto/)).toBeInTheDocument();
  });

  it("should render nothing when the driver does not exist", () => {
    render(<DriverWarning engine="invalid" engines={engines} />);
    expect(screen.queryByText(/driver/)).not.toBeInTheDocument();
  });

  it("should render nothing when there is no new driver", () => {
    render(<DriverWarning engine="postgres" engines={engines} />);
    expect(screen.queryByText(/driver/)).not.toBeInTheDocument();
  });
});
