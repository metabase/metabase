/* eslint-disable no-unscoped-text-selectors */
import React from 'react';
import { mount } from 'cypress/react';
import { MetabaseProvider, StaticQuestion } from 'sdk';
// import {
//   ORDERS_QUESTION_ID,
//   JWT_SHARED_SECRET,
//   setupJwt,
// } from "e2e/support/helpers";

const ORDERS_QUESTION_ID = 1;
const JWT_SHARED_SECRET = "0000000000000000000000000000000000000000000000000000000000000000";
const setupJwt = () => { };
const METABASE_BASE_URL = "http://localhost:3000";


describe('SDK Style Leaks', () => {
  beforeEach(() => {
    setupJwt();
  });

  it('should use the default fonts outside of our components, and Lato on our components in success scenario', () => {
    mount(
      <div>
        <h1>No styles applied anywhere, should use browser default</h1>
        <div style={{ border: "1px solid black" }}>
          <h1>This is outside of the provider</h1>
        </div>

        <MetabaseProvider config={{
          jwtProviderUri: "http://localhost:8888/api/sso",
          metabaseInstanceUrl: METABASE_BASE_URL,
        }}>
          <div style={{ border: "1px solid black" }}>
            <h1>This is inside of the provider</h1>
          </div>

          <StaticQuestion questionId={ORDERS_QUESTION_ID} />
        </MetabaseProvider>
      </div>
    );

    cy.findByText("This is outside of the provider").should(
      "have.css",
      "font-family"
    ).then((fontFamily) => {
      cy.wrap(fontFamily).as("defaultBrowserFontFamily");
    });

    cy.get("@defaultBrowserFontFamily").then(defaultBrowserFontFamily => {
      cy.findByText("This is outside of the provider").should(
        "have.css",
        "font-family",
        defaultBrowserFontFamily,
      );
      cy.findByText("This is inside of the provider").should(
        "have.css",
        "font-family",
        defaultBrowserFontFamily,
      );
      cy.findByText(/previous month/).should(
        "have.css",
        "font-family",
        "Lato, sans-serif",
      );
    });
  });

  it('should use the default fonts outside of our components, and Lato on our components in error scenario', () => {
    mount(
      <div>
        <h1>No styles applied anywhere, should use browser default</h1>
        <div style={{ border: "1px solid black" }}>
          <h1>This is outside of the provider</h1>
        </div>

        <MetabaseProvider config={{
          jwtProviderUri: "http://localhost:8888/api/sso",
          metabaseInstanceUrl: "http://fake-host:1234",
        }}>
          <div style={{ border: "1px solid black" }}>
            <h1>This is inside of the provider</h1>
          </div>

          <StaticQuestion questionId={ORDERS_QUESTION_ID} />
        </MetabaseProvider>
      </div>
    );

    cy.findByText("This is outside of the provider").should(
      "have.css",
      "font-family"
    ).then((fontFamily) => {
      cy.wrap(fontFamily).as("defaultBrowserFontFamily");
    });

    cy.get("@defaultBrowserFontFamily").then(defaultBrowserFontFamily => {
      cy.findByText("This is outside of the provider").should(
        "have.css",
        "font-family",
        defaultBrowserFontFamily,
      );
      cy.findByText("This is inside of the provider").should(
        "have.css",
        "font-family",
        defaultBrowserFontFamily,
      );
      cy.findByText(
        "Could not authenticate: invalid JWT URI or JWT provider did not return a valid JWT token",
      ).should("have.css", "font-family", "Lato, sans-serif");
    });
  });

  it('should use the font from the theme if set', () => {
    mount(
      <div>
        <MetabaseProvider
          config={{
            jwtProviderUri: "http://localhost:8888/api/sso",
            metabaseInstanceUrl: METABASE_BASE_URL,
          }}
          theme={{ fontFamily: "Impact" }}
        >
          <StaticQuestion questionId={ORDERS_QUESTION_ID} />
        </MetabaseProvider>
      </div>
    );

    cy.findByText(/previous month/).should(
      "have.css",
      "font-family",
      "Impact",
    );
  });

});
