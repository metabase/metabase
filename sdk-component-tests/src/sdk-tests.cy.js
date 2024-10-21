import React, { useMemo } from "react";
import { MetabaseProvider, StaticDashboard } from "sdk";
// } from "@metabase/embedding-sdk-react";

const HelloWorld = () => {
  const hello = useMemo(() => "Hello World", []);
  return (
    <div>
      <h1>{hello}</h1>
    </div>
  );
};

describe("SDK Tests", () => {
  it("should render a dashboard 1", () => {
    cy.mount(
      <div>
        <h1>cypress component tests</h1>
        <HelloWorld />
        <MetabaseProvider
          config={{
            jwtProviderUri: "http://localhost:8888/api/sso",
            metabaseInstanceUrl: "http://localhost:3000",
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
        <HelloWorld />
        <MetabaseProvider
          config={{
            jwtProviderUri: "http://localhost:8888/api/sso",
            metabaseInstanceUrl: "http://localhost:3000",
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
