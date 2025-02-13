import { render, screen } from "@testing-library/react";

import {
  createMockEngine,
  createMockEngineSource,
} from "metabase-types/api/mocks";

import DatabaseEngineWarning from "./DatabaseEngineWarning";

describe("DatabaseEngineWarning", () => {
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
      source: createMockEngineSource({
        type: "community",
      }),
    }),
    communityEngine: createMockEngine({
      "driver-name": "CommunityEngine",
      source: createMockEngineSource({
        type: "community",
      }),
    }),
    partnerEngine: createMockEngine({
      "driver-name": "PartnerEngine",
      source: createMockEngineSource({
        type: "partner",
        contact: {
          name: "Partners Incorporated",
          address: "https://example.com/contact",
        },
      }),
    }),
    anonymousPartnerEngine: createMockEngine({
      "driver-name": "AnonymousPartnerEngine",
      source: createMockEngineSource({
        type: "partner",
      }),
    }),
    partnerWithoutContactInfoEngine: createMockEngine({
      "driver-name": "PartnerWithoutContactInfoEngine",
      source: createMockEngineSource({
        type: "partner",
        contact: {
          name: "Partners Incorporated Two",
        },
      }),
    }),
    partnerEngineWithEmail: createMockEngine({
      "driver-name": "PartnerEngineWithEmail",
      source: createMockEngineSource({
        type: "partner",
        contact: {
          name: "Partners Incorporated Three",
          address: "contactus@example.com",
        },
      }),
    }),
  };

  it("should render a warning when the driver is deprecated", () => {
    render(<DatabaseEngineWarning engineKey="presto" engines={engines} />);
    expect(screen.getByText(/This driver will be removed/)).toBeInTheDocument();
  });

  it("should render a warning when the driver is new", () => {
    render(<DatabaseEngineWarning engineKey="presto-jdbc" engines={engines} />);
    expect(screen.getByText(/This is our new Presto/)).toBeInTheDocument();
  });

  it("should render nothing when the driver does not exist", () => {
    render(<DatabaseEngineWarning engineKey="invalid" engines={engines} />);
    expect(screen.queryByText(/driver/)).not.toBeInTheDocument();
  });

  it("should render nothing when there is no new driver, and the driver is official", () => {
    render(<DatabaseEngineWarning engineKey="postgres" engines={engines} />);
    expect(screen.queryByText(/driver/)).not.toBeInTheDocument();
  });

  it("should render a community driver warning for drivers from community sources", () => {
    render(
      <DatabaseEngineWarning engineKey="communityEngine" engines={engines} />,
    );
    expect(screen.getByText(/community-developed driver/)).toBeInTheDocument();
  });

  it("should render both community and deprecated warnings together", () => {
    render(
      <DatabaseEngineWarning
        engineKey="deprecatedCommunity"
        engines={engines}
      />,
    );
    expect(screen.getByText(/community-developed driver/)).toBeInTheDocument();
    expect(screen.getByText(/This driver will be removed/)).toBeInTheDocument();
  });

  it("should render a partner driver warning for drivers from partner sources", () => {
    render(
      <DatabaseEngineWarning engineKey="partnerEngine" engines={engines} />,
    );
    expect(screen.getByText(/partner-developed driver/)).toBeInTheDocument();
  });

  it("should render a partner contact information web link", () => {
    render(
      <DatabaseEngineWarning engineKey="partnerEngine" engines={engines} />,
    );
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "https://example.com/contact",
    );
  });

  it("should render a partner contact information email link", () => {
    render(
      <DatabaseEngineWarning
        engineKey="partnerEngineWithEmail"
        engines={engines}
      />,
    );
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "mailto:contactus@example.com",
    );
  });

  it("should render a partner warning when missing contact name", () => {
    render(
      <DatabaseEngineWarning
        engineKey="anonymousPartnerEngine"
        engines={engines}
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("should render a partner warning when missing contact information", () => {
    render(
      <DatabaseEngineWarning
        engineKey="partnerWithoutContactInfoEngine"
        engines={engines}
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    screen.getByText(/partner-developed driver/);
    screen.getByText(/Partners Incorporated Two/);
  });
});
