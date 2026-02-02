import { screen } from "@testing-library/react";

import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { renderWithProviders } from "__support__/ui";
import { createMockDatabase } from "metabase-types/api/mocks";

import { DatabaseRoutingWarning } from "./DatabaseRoutingWarning";

const setup = (props: {
  resourceType: "dashboard" | "question";
  resource: any;
  databases?: any[];
}) => {
  const { resourceType, resource, databases = [] } = props;

  setupDatabasesEndpoints(databases);

  return renderWithProviders(
    <DatabaseRoutingWarning resource={resource} resourceType={resourceType} />,
  );
};

describe("DatabaseRoutingWarning", () => {
  const mockRoutingDatabase = createMockDatabase({
    id: 2,
    router_user_attribute: "department",
  });

  const mockNormalDatabase = createMockDatabase({
    id: 1,
    router_user_attribute: null,
  });

  describe("for questions", () => {
    it("does not render warning for question using non-routing database", () => {
      const question = { database_id: 1 };
      setup({
        resourceType: "question",
        resource: question,
        databases: [mockNormalDatabase, mockRoutingDatabase],
      });

      expect(
        screen.queryByText(/database routing active/i),
      ).not.toBeInTheDocument();
    });

    it("renders warning for question using routing-enabled database", () => {
      const question = { database_id: 2 };
      setup({
        resourceType: "question",
        resource: question,
        databases: [mockNormalDatabase, mockRoutingDatabase],
      });

      expect(screen.getByText(/database routing active/i)).toBeInTheDocument();
      expect(
        screen.getByText(
          /this question is querying a database with database routing enabled/i,
        ),
      ).toBeInTheDocument();
    });

    it("does not render warning for question without database_id", () => {
      const question = { database_id: undefined };
      setup({
        resourceType: "question",
        resource: question,
        databases: [mockNormalDatabase, mockRoutingDatabase],
      });

      expect(
        screen.queryByText(/database routing active/i),
      ).not.toBeInTheDocument();
    });
  });

  describe("for dashboards", () => {
    it("does not render warning for dashboard with no routing-enabled databases", () => {
      const dashboard = {
        dashcards: [
          {
            card: { database_id: 1 },
          },
        ],
      };

      setup({
        resourceType: "dashboard",
        resource: dashboard,
        databases: [mockNormalDatabase, mockRoutingDatabase],
      });

      expect(
        screen.queryByText(/database routing active/i),
      ).not.toBeInTheDocument();
    });

    it("renders warning for dashboard with routing-enabled databases", () => {
      const dashboard = {
        dashcards: [
          {
            card: { database_id: 2 },
          },
        ],
      };

      setup({
        resourceType: "dashboard",
        resource: dashboard,
        databases: [mockNormalDatabase, mockRoutingDatabase],
      });

      expect(screen.getByText(/database routing active/i)).toBeInTheDocument();
      expect(
        screen.getByText(
          /one or more questions in this dashboard are querying/i,
        ),
      ).toBeInTheDocument();
    });

    it("renders warning for dashboard with series cards using routing", () => {
      const dashboard = {
        dashcards: [
          {
            card: { database_id: 1 },
            series: [{ database_id: 2 }],
          },
        ],
      };

      setup({
        resourceType: "dashboard",
        resource: dashboard,
        databases: [mockNormalDatabase, mockRoutingDatabase],
      });

      expect(screen.getByText(/database routing active/i)).toBeInTheDocument();
      expect(
        screen.getByText(
          /one or more questions in this dashboard are querying/i,
        ),
      ).toBeInTheDocument();
    });

    it("does not render warning for dashboard without dashcards", () => {
      const dashboard = { dashcards: undefined };

      setup({
        resourceType: "dashboard",
        resource: dashboard,
        databases: [mockNormalDatabase, mockRoutingDatabase],
      });

      expect(
        screen.queryByText(/database routing active/i),
      ).not.toBeInTheDocument();
    });
  });
});
