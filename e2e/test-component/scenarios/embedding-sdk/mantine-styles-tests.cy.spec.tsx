// To apply cypress-level mantine styles
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";

// Mimics behavior when an app adds its own styles
// We need to do it before importing the SDK
import "e2e/support/helpers/embedding-sdk-helpers/host-app-styles.css";

import { Button, MantineProvider, Title } from "@mantine/core";
import {
  InteractiveQuestion,
  MetabaseProvider,
} from "@metabase/embedding-sdk-react";

import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { DEFAULT_SDK_AUTH_PROVIDER_CONFIG } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

describe("scenarios > embedding-sdk > mantine styles leakage", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    cy.signOut();

    mockAuthProviderAndJwtSignIn();
  });

  it("css variables should not leak outside of mb-wrapper", () => {
    cy.mount(
      <MantineProvider
        theme={{ colors: { brand: colorTuple("rgb(255, 0, 255)") } }}
      >
        <Button color="brand">outside sdk provider</Button>

        <MetabaseProvider
          authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}
          theme={{ colors: { brand: "rgb(255, 0, 0)" } }}
        >
          <Button color="brand">outside sdk wrapper</Button>

          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} isSaveEnabled />
        </MetabaseProvider>
      </MantineProvider>,
    );

    cy.log(
      "Customer's elements outside of the SDK provider should have their brand color intact",
    );

    cy.contains("button", "outside sdk provider").should(
      "have.css",
      "background-color",
      "rgb(255, 0, 255)",
    );

    cy.log(
      "Customer's elements outside of the SDK components should have their brand color intact",
    );

    cy.contains("button", "outside sdk wrapper").should(
      "have.css",
      "background-color",
      "rgb(255, 0, 255)",
    );

    cy.log("SDK elements should have the brand color from the Metabase theme");

    getSdkRoot().within(() => {
      cy.get("button")
        .contains("Filter")
        .should("have.css", "color", "rgb(255, 0, 0)");

      cy.findByTestId("notebook-button").click();

      cy.findByRole("button", { name: "Visualize" }).should(
        "have.css",
        "background-color",
        "rgb(255, 0, 0)",
      );
    });
  });

  it("Mantine styles added by SDK should not override custom styles of an app", () => {
    const TitleWrapper = () => (
      <Title data-testid="title" className="some-title">
        Some title
      </Title>
    );

    cy.mount(
      <MantineProvider>
        <TitleWrapper />

        <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
        </MetabaseProvider>
      </MantineProvider>,
    );

    getSdkRoot().findByText("Product ID").should("exist");

    cy.findByTestId("title").should("have.css", "font-size", "40px");
  });

  it("App styles should not affect SDK styles", () => {
    cy.mount(
      <MantineProvider>
        <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
        </MetabaseProvider>
      </MantineProvider>,
    );

    getSdkRoot().findByText("Product ID").should("exist");

    cy.findByTestId("interactive-question-result-toolbar").within(() => {
      cy.findByText("Filter").should(
        "have.css",
        "background-color",
        "rgba(0, 0, 0, 0)",
      );
    });
  });
});

export const colorTuple = (value: string) =>
  [
    value,
    value,
    value,
    value,
    value,
    value,
    value,
    value,
    value,
    value,
  ] as const;
