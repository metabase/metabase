/* eslint-disable no-unscoped-text-selectors */
import React from 'react';
import { MetabaseProvider, StaticQuestion } from 'embedding-sdk';
import { JWT_PROVIDER_URL, METABASE_INSTANCE_URL, mockJwtProvider } from '../cypress/support/sdk-mocks';

const QUESTION_ID = 1;


const wrapDefaultBrowserFontFamilyValue = () => {
  cy.mount(<h1>default browser font family</h1>)

  return cy.findByText("default browser font family").should(
    "have.css",
    "font-family"
  ).then((fontFamily) => {
    return cy.wrap(fontFamily).as("defaultBrowserFontFamily")
  });
}

describe('SDK Style Leaks', () => {
  beforeEach(() => {
    mockJwtProvider();
  });

  it('should use the default fonts outside of our components, and Lato on our components in success scenario', () => {
    wrapDefaultBrowserFontFamilyValue()

    cy.mount(
      <div>
        <h1>No styles applied anywhere, should use browser default</h1>
        <div style={{ border: "1px solid black" }}>
          <h1>This is outside of the provider</h1>
        </div>

        <MetabaseProvider config={{
          jwtProviderUri: JWT_PROVIDER_URL,
          metabaseInstanceUrl: METABASE_INSTANCE_URL,
        }}>
          <div style={{ border: "1px solid black" }}>
            <h1>This is inside of the provider</h1>
          </div>

          <StaticQuestion questionId={QUESTION_ID} />
        </MetabaseProvider>
      </div>
    );


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
    wrapDefaultBrowserFontFamilyValue()

    cy.mount(
      <div>
        <h1>No styles applied anywhere, should use browser default</h1>
        <div style={{ border: "1px solid black" }}>
          <h1>This is outside of the provider</h1>
        </div>

        <MetabaseProvider config={{
          jwtProviderUri: JWT_PROVIDER_URL,
          metabaseInstanceUrl: "http://fake-host:1234",
        }}>
          <div style={{ border: "1px solid black" }}>
            <h1>This is inside of the provider</h1>
          </div>

          <StaticQuestion questionId={QUESTION_ID} />
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
    cy.mount(
      <div>
        <MetabaseProvider
          config={{
            jwtProviderUri: JWT_PROVIDER_URL,
            metabaseInstanceUrl: METABASE_INSTANCE_URL,
          }}
          theme={{ fontFamily: "Impact" }}
        >
          <StaticQuestion questionId={QUESTION_ID} />
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
