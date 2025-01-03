import { METABASE_SECRET_KEY } from "e2e/support/cypress_data";
import { modal, popover } from "e2e/support/helpers/e2e-ui-elements-helpers";

import { openSharingMenu } from "./e2e-sharing-helpers";

/**
 * @typedef {object} QuestionResource
 * @property {number} question - ID of a question we are embedding
 *
 * @typedef {object} DashboardResource
 * @property {number} dashboard - ID of a dashboard we are embedding
 *
 * @typedef {object} EmbedPayload
 * @property {(QuestionResource|DashboardResource)} resource
 * {@link QuestionResource} or {@link DashboardResource}
 * @property {object} params
 *
 * @typedef {import("metabase/public/lib/types").EmbeddingAdditionalHashOptions} EmbeddingAdditionalHashOptions
 *
 * @typedef {EmbeddingAdditionalHashOptions['hide_parameters']} HiddenFilters
 *
 * @typedef {object} PageStyle
 * @property {boolean} [bordered]
 * @property {boolean} [titled]
 * @property {boolean} [hide_download_button] - EE/PRO only feature to disable downloads
 * @property {boolean} [downloads] - EE/PRO only feature to disable downloads
 */

/**
 * Programmatically generate token and visit the embedded page for a question or a dashboard
 *
 * @param {EmbedPayload} payload - The {@link EmbedPayload} we pass to this function
 * @param {object=} options
 * @param {object} [options.setFilters]
 * @param {PageStyle} options.pageStyle
 * @param {object} options.additionalHashOptions
 * @param {string} [options.additionalHashOptions.locale]
 * @param {string[]} [options.additionalHashOptions.hideFilters]
 * @param {object} [options.qs]
 *
 * @example
 * visitEmbeddedPage(payload, {
 *   setFilters: {id: 92, source: "Organic"},
 *   pageStyle: {titled: true},
 *   hideFilters: ["id", "source"]
 * });
 */
export function visitEmbeddedPage(payload, options) {
  getEmbeddedPageUrl(payload, options).then(urlOptions => {
    // Always visit embedded page logged out
    cy.signOut();

    cy.visit(urlOptions);
  });
}

/**
 * Programmatically generate token for the embedded page for a question or a dashboard
 *
 * @param {EmbedPayload} payload - The {@link EmbedPayload} we pass to this function
 * @param {object} options
 * @param {object} [options.setFilters]
 * @param {PageStyle} options.pageStyle
 * @param {object} options.additionalHashOptions
 * @param {string} [options.additionalHashOptions.locale]
 * @param {string[]} [options.additionalHashOptions.hideFilters]
 * @param {object} [options.qs]
 *
 * @example
 * getEmbeddedPageUrl(payload, {
 *   setFilters: {id: 92, source: "Organic"},
 *   pageStyle: {titled: true},
 *   hideFilters: ["id", "source"]
 * });
 */
export function getEmbeddedPageUrl(
  payload,
  {
    setFilters = {},
    additionalHashOptions: { hideFilters = [], locale } = {},
    pageStyle = {},
    onBeforeLoad,
    qs,
  } = {},
) {
  const jwtSignLocation = "e2e/support/external/e2e-jwt-sign.js";

  const payloadWithExpiration = {
    ...payload,
    exp: Math.round(Date.now() / 1000) + 10 * 60, // 10 minute expiration
  };

  const stringifiedPayload = JSON.stringify(payloadWithExpiration);
  const signTransaction = `node  ${jwtSignLocation} '${stringifiedPayload}' ${METABASE_SECRET_KEY}`;

  return cy.exec(signTransaction).then(({ stdout: tokenizedQuery }) => {
    const embeddableObject = getEmbeddableObject(payload);
    const hiddenFilters = getHiddenFilters(hideFilters);
    const urlRoot = `/embed/${embeddableObject}/${tokenizedQuery}`;
    const urlHash = getHash(
      {
        ...pageStyle,
        ...(locale ? { locale } : {}),
      },
      hiddenFilters,
    );

    return {
      url: urlRoot,
      qs: { ...setFilters, ...qs },
      onBeforeLoad: window => {
        onBeforeLoad?.(window);
        if (urlHash) {
          window.location.hash = urlHash;
        }
      },
    };
  });

  /**
   * Construct a hidden filters object from the list of filters we want to hide
   *
   * @param {string[]} filters
   * @returns {HiddenFilters}
   */
  function getHiddenFilters(filters) {
    const params = filters.join(",");
    return filters.length > 0 ? { hide_parameters: params } : {};
  }

  /**
   * Get the URL hash from the page style and/or hidden filters parameters
   *
   * @param {PageStyle & EmbeddingAdditionalHashOptions['locale']} hashOptions
   * @param {HiddenFilters} hiddenFilters
   *
   * @returns string
   */
  function getHash(hashOptions, hiddenFilters) {
    return new URLSearchParams({ ...hashOptions, ...hiddenFilters }).toString();
  }

  /**
   * Extract the embeddable object type from the payload
   *
   * @param {EmbedPayload} payload - See {@link EmbedPayload}
   * @returns ("question"|"dashboard")
   */
  function getEmbeddableObject(payload) {
    return Object.keys(payload.resource)[0];
  }
}

/**
 * Grab an iframe `src` via UI and open it,
 * but make sure user is signed out.
 */
export function visitIframe() {
  getIframeUrl().then(iframeUrl => {
    cy.signOut();
    cy.visit(iframeUrl);
  });
}

function getIframeUrl() {
  modal().findByText("Preview").click();

  return cy.document().then(doc => {
    const iframe = doc.querySelector("iframe");

    return iframe.src;
  });
}

/**
 * Get page iframe body wrapped in `cy` helper
 * @param {string} [selector]
 */
export function getIframeBody(selector = "iframe") {
  return cy
    .get(selector)
    .its("0.contentDocument")
    .should("exist")
    .its("body")
    .should("not.be.null")
    .then(cy.wrap);
}

export function getEmbedModalSharingPane() {
  return cy.findByTestId("sharing-pane-container");
}

/**
 * Open Static Embedding setup modal
 * @param {object} params
 * @param {("overview"|"parameters"|"lookAndFeel")} [params.activeTab] - modal tab to open
 * @param {("code"|"preview")} [params.previewMode] - preview mode type to activate
 * @param {boolean} [params.acceptTerms] - whether we need to go through the legalese step
 */
export function openStaticEmbeddingModal({
  activeTab,
  previewMode,
  acceptTerms = true,
  confirmSave,
} = {}) {
  openSharingMenu("Embed");

  if (confirmSave) {
    cy.findByRole("button", { name: "Save" }).click();
  }

  cy.findByText("Static embedding").click();

  if (acceptTerms) {
    cy.findByTestId("accept-legalese-terms-button").click();
  }

  modal().within(() => {
    if (activeTab) {
      const tabKeyToNameMap = {
        overview: "Overview",
        parameters: "Parameters",
        lookAndFeel: "Look and Feel",
      };

      cy.findByRole("tab", { name: tabKeyToNameMap[activeTab] }).click();
    }

    if (previewMode) {
      const previewModeToKeyMap = {
        code: "Code",
        preview: "Preview",
      };

      cy.findByText(previewModeToKeyMap[previewMode]).click();
    }
  });
}

export function closeStaticEmbeddingModal() {
  modal().icon("close").click();
}

/**
 * Open Static Embedding setup modal
 * @param {"card" | "dashboard"} apiPath
 * @param callback
 */
export function publishChanges(apiPath, callback) {
  cy.intercept("PUT", `/api/${apiPath}/*`).as("publishChanges");

  cy.button(/^(Publish|Publish changes)$/).click();

  // TODO this could be simplified when we send one publish request instead of two
  cy.wait(["@publishChanges", "@publishChanges"]).then(xhrs => {
    // Unfortunately, the order of requests is not always the same.
    // Therefore, we must first get the one that has the `embedding_params` and then assert on it.
    const targetXhr = xhrs.find(({ request }) =>
      Object.keys(request.body).includes("embedding_params"),
    );
    callback?.(targetXhr);
  });
}

export function getParametersContainer() {
  return cy.findByLabelText("Configuring parameters");
}

export function setEmbeddingParameter(name, value) {
  getParametersContainer().findByLabelText(name).click();
  popover().contains(value).click();
}

export function assertEmbeddingParameter(name, value) {
  getParametersContainer().findByLabelText(name).should("have.text", value);
}

// @param {("card"|"dashboard")} resourceType - The type of resource we are sharing
export function openNewPublicLinkDropdown(resourceType) {
  cy.intercept("POST", `/api/${resourceType}/*/public_link`).as(
    "sharingEnabled",
  );

  openSharingMenu(/public link/i);

  cy.wait("@sharingEnabled").then(
    ({
      response: {
        body: { uuid },
      },
    }) => {
      cy.wrap(uuid).as("uuid");
    },
  );
}

export function createPublicQuestionLink(questionId) {
  return cy.request("POST", `/api/card/${questionId}/public_link`, {});
}

export function createPublicDashboardLink(dashboardId) {
  return cy.request("POST", `/api/dashboard/${dashboardId}/public_link`, {});
}

/**
 * @param {Object} options
 * @param {string} options.url
 * @param {Object} options.qs
 * @param {Function} [options.onBeforeLoad]
 */
export const visitFullAppEmbeddingUrl = ({ url, qs, onBeforeLoad }) => {
  cy.visit({
    url,
    qs,
    onBeforeLoad(window) {
      // cypress runs all tests in an iframe and the app uses this property to avoid embedding mode for all tests
      // by removing the property the app would work in embedding mode
      window.Cypress = undefined;
      onBeforeLoad?.(window);
    },
  });
};
