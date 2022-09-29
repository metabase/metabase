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
    deprecatedCommunity: createMockEngine({
      "driver-name": "Community (Deprecated Driver)",
      "superseded-by": "communityEngine",
      source: {
        type: "community",
      },
    }),
    communityEngine: createMockEngine({
      "driver-name": "CommunityEngine",
      source: {
        type: "community",
      },
    }),
    partnerEngine: createMockEngine({
      "driver-name": "PartnerEngine",
      source: {
        type: "partner",
        contact: {
          name: "Partners Incorporated",
          address: "https://example.com/contact",
        },
      },
    }),
    anonymousPartnerEngine: createMockEngine({
      "driver-name": "AnonymousPartnerEngine",
      source: {
        type: "partner",
      },
    }),
    partnerWithoutContactInfoEngine: createMockEngine({
      "driver-name": "PartnerWithoutContactInfoEngine",
      source: {
        type: "partner",
        contact: {
          name: "Partners Incorporated Two",
        },
      },
    }),
    partnerEngineWithEmail: createMockEngine({
      "driver-name": "PartnerEngineWithEmail",
      source: {
        type: "partner",
        contact: {
          name: "Partners Incorporated Three",
          address: "contactus@example.com",
        },
      },
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

  it("should render a warning when the driver is new", () => {
    render(<DriverWarning engine="presto-jdbc" engines={engines} />);
    expect(screen.getByText(/This is our new Presto/)).toBeInTheDocument();
  });

  it("should render nothing when there is no new driver, and the driver is official", () => {
    render(<DriverWarning engine="postgres" engines={engines} />);
    expect(screen.queryByText(/driver/)).not.toBeInTheDocument();
  });

  it("should render a community driver warning for drivers from community sources", () => {
    render(<DriverWarning engine="communityEngine" engines={engines} />);
    expect(
      screen.queryByText(/community-developed driver/),
    ).toBeInTheDocument();
  });

  it("should render both community and deprecated warnings together", () => {
    render(<DriverWarning engine="deprecatedCommunity" engines={engines} />);
    expect(
      screen.queryByText(/community-developed driver/),
    ).toBeInTheDocument();
    expect(screen.getByText(/This driver will be removed/)).toBeInTheDocument();
  });

  it("should render a partner driver warning for drivers from partner sources", () => {
    render(<DriverWarning engine="partnerEngine" engines={engines} />);
    expect(screen.queryByText(/partner-developed driver/)).toBeInTheDocument();
  });

  it("should render a partner contact information web link", () => {
    const { container } = render(
      <DriverWarning engine="partnerEngine" engines={engines} />,
    );
    expect(container.querySelector("a")).toHaveAttribute(
      "href",
      "https://example.com/contact",
    );
  });

  it("should render a partner contact information email link", () => {
    const { container } = render(
      <DriverWarning engine="partnerEngineWithEmail" engines={engines} />,
    );
    expect(container.querySelector("a")).toHaveAttribute(
      "href",
      "mailto:contactus@example.com",
    );
  });

  it("should render a partner warning when missing contact name", () => {
    const { container } = render(
      <DriverWarning engine="anonymousPartnerEngine" engines={engines} />,
    );
    expect(container.querySelector("a")).toBeNull();
  });

  it("should render a partner warning when missing contact information", () => {
    const { container } = render(
      <DriverWarning
        engine="partnerWithoutContactInfoEngine"
        engines={engines}
      />,
    );
    expect(container.querySelector("a")).toBeNull();
    screen.getByText(/partner-developed driver/);
    screen.getByText(/Partners Incorporated Two/);
  });
});
