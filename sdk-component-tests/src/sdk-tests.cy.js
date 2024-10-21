import React, { useMemo } from "react";
import { MetabaseProvider, StaticDashboard } from "embedding-sdk";
import { JWT_PROVIDER_URL, METABASE_INSTANCE_URL, mockJwtProvider } from "../cypress/support/sdk-mocks";


describe("SDK Tests", () => {
  beforeEach(() => {
    mockJwtProvider();
  });

  it("should render a dashboard 1", () => {
    cy.mount(
      <div>
        <h1>cypress component tests</h1>
        <MetabaseProvider
          config={{
            jwtProviderUri: JWT_PROVIDER_URL,
            metabaseInstanceUrl: METABASE_INSTANCE_URL,
          }}
        >
          <h2>inside MetabaseProvider 1</h2>
          <StaticDashboard dashboardId={1} />
        </MetabaseProvider>
      </div>
    );

    cy.findByText("E-commerce insights").should("exist");
    cy.findByText("inside MetabaseProvider 1").should("exist");
  });

  it("should render a dashboard 2", () => {
    cy.mount(
      <div>
        <h1>cypress component tests</h1>
        <MetabaseProvider
          config={{
            jwtProviderUri: JWT_PROVIDER_URL,
            metabaseInstanceUrl: METABASE_INSTANCE_URL,
          }}
        >
          <h2>inside MetabaseProvider 2</h2>
          <StaticDashboard dashboardId={1} />
        </MetabaseProvider>
      </div>
    );

    cy.findByText("E-commerce insights").should("exist");
    cy.findByText("inside MetabaseProvider 2").should("exist");
  });
});
