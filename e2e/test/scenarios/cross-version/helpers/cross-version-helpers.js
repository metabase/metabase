import { echartsContainer } from "e2e/support/helpers";

export function parseVersionString(versionString) {
  if (typeof versionString === "undefined") {
    return []; // Return empty array if versionString is undefined
  }

  const segments = versionString.match(/\d+/g);
  if (!segments) {
    return { version: versionString }; // Return versionString if no segments found
  }

  const segmentInts = segments.map(segment => parseInt(segment, 10));
  const editionIndex = segmentInts[0];

  let edition = null;
  if (editionIndex === 1) {
    edition = "ee";
  } else if (editionIndex === 0) {
    edition = "oss";
  }

  return {
    version: versionString,
    edition: edition,
    majorVersion: segmentInts[1],
    minorVersion: segmentInts[2],
    patchVersion: segmentInts[3],
  };
}

// Versions in which a breaking GUI change was introduced. For example, version
// 32 added a "What will you use Metabase for?" stage in the initial setup.

// Change: Adds "What will you use Metabase for?" stage in the initial setup.
// Git sha: d88d32e5e021ad4f47b5d740b78df73945e8ff82
// Date: 2024-02-08
// Author: npretto
const metabasePurposeVersion = 49;

// Change: Question save modal logic changes required different cypress logic
//         to click "Save" button as former cy.clck("Save") became ambiguous.
// Git sha: f90e4db22e0b668600846e00ed4d1e28d8f92d95
// Date: 2024-02-23
// Author: markbastian
const updatedCypressSaveLogicVersion = 49;

// Change: Sample data times changed.
// TODO: The specific version in which this changed hasn't been tracked down
// yet, but this is an upper bound. If more cross-version checks are added for
// earlier versions and this breaks, this number may need to be adjusted down.
export const sampleDataTimesChangedVersion = 47;

// Change: In older versions of metabase, when a question was loaded a modal was
// presented stating "It's okay to play around with saved questions". The user
// was required to press "Okay" to dismiss this modal. In later versions this
// modal was not presented in the same location.
// TODO: The specific version in which this changed hasn't been tracked down
// yet, but this is an upper bound. If more cross-version checks are added for
// earlier versions and this breaks, this number may need to be adjusted down.
export const questionsAreOkToPlayWithModalVersion = 45;

// Change: Older versions of Metabase presented a 3-panel display, the center
// panel being "Custom question". In later generations, this was accessible via
// clicking "New" -> "Question" at the top right corner in the UI.
// TODO: The specific version in which this changed hasn't been tracked down
// yet, but this is an upper bound. If more cross-version checks are added for
// earlier versions and this breaks, this number may need to be adjusted down.
export const newQuestionMenuVersion = 45;

// Change: In older versions of metabase, area and line charts were selectable
// Visualization types, but the actual operation to fill the area was to select
// the "area" icon in the Display settings, which is really weird.
// TODO: The specific version in which this changed hasn't been tracked down
// yet, but this is an upper bound. If more cross-version checks are added for
// earlier versions and this breaks, this number may need to be adjusted down.
export const filledAreaIconRemovedVersion = 45;

export function setupLanguage() {
  // Make sure English is the default selected language
  cy.findByText("English")
    .should("have.css", "background-color")
    .and("eq", "rgb(80, 158, 227)");

  cy.button("Next").click();
  cy.findByText("Your language is set to English");
}

export function setupInstance({ version, majorVersion }) {
  const companyLabel =
    version === "v0.41.3.1"
      ? "Your company or team name"
      : "Company or team name";

  const finalSetupButton = version === "v0.41.3.1" ? "Next" : "Finish";

  cy.findByLabelText("First name").type("Superuser");
  cy.findByLabelText("Last name").type("Tableton");
  cy.findByLabelText("Email").type("admin@metabase.test");
  cy.findByLabelText(companyLabel).type("Metabase");
  cy.findByLabelText("Create a password").type("12341234");
  cy.findByLabelText("Confirm your password").type("12341234");
  cy.button("Next").click();
  cy.findByText("Hi, Superuser. Nice to meet you!");

  // A "What will you use Metabase for?" prompt exists in later versions.
  // If it exists, click through.
  if (majorVersion >= metabasePurposeVersion) {
    cy.button("Next").click();
  }

  cy.findByText("I'll add my data later").click();
  cy.findByText("I'll add my own data later");

  // Collection defaults to on and describes data collection
  cy.findByText("All collection is completely anonymous.");
  // turn collection off, which hides data collection description
  cy.findByLabelText(
    "Allow Metabase to anonymously collect usage events",
  ).click();
  cy.findByText("All collection is completely anonymous.").should("not.exist");
  cy.findByText(finalSetupButton).click();
  cy.findByText("Take me to Metabase").click();

  cy.location("pathname").should("eq", "/");
  cy.contains("Reviews");
}

export function newQuestion({ majorVersion }) {
  if (majorVersion < newQuestionMenuVersion) {
    cy.findByText("Custom question").click();
  } else {
    cy.button("New").click();
    cy.findByText("Question").click();
  }
}

export function saveQuestion({ majorVersion }) {
  if (majorVersion < updatedCypressSaveLogicVersion) {
    cy.button("Save").click();
  } else {
    cy.findByTestId("save-question-modal").within(modal => {
      cy.findByText("Save").click();
    });
  }
}

export function assertTimelineData({ majorVersion }) {
  if (majorVersion < sampleDataTimesChangedVersion) {
    echartsContainer()
      .should("contain", "Q1 - 2017")
      .and("contain", "Q1 - 2018")
      .and("contain", "Q1 - 2019")
      .and("contain", "Q1 - 2020");
  } else {
    echartsContainer()
      .should("contain", "Q1 2023")
      .and("contain", "Q1 2024")
      .and("contain", "Q1 2025")
      .and("contain", "Q1 2026");
  }
}

export function dismissOkToPlayWithQuestionsModal({ majorVersion }) {
  if (majorVersion < questionsAreOkToPlayWithModalVersion) {
    cy.findByText("It's okay to play around with saved questions");
    cy.button("Okay").click();
  }
}

export function fillAreaUnderLineChart({ majorVersion }) {
  if (majorVersion < filledAreaIconRemovedVersion) {
    cy.findByTestId("sidebar-left").within(element => {
      cy.icon("area").click();
    });
  }
}
