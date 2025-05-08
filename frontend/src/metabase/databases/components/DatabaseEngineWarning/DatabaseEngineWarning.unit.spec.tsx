import { render, screen } from "__support__/ui";
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
});
