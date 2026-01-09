import { getIframeBody } from "./e2e-embedding-helpers";

/**
 * Base interface for interactive embedding test page options
 */
interface BaseEmbedTestPageOptions {
  dashboardId: number | string;
  iframeSelector?: string;
}

/**
 * Creates and loads a test fixture for interactive iframe embedding tests
 */
export function loadInteractiveIframeEmbedTestPage({
  iframeSelector,
  ...options
}: BaseEmbedTestPageOptions) {
  const testPageSource = getInteractiveHtml(options);

  const testPageUrl = `${origin}/interactive-iframe-test-page`;

  cy.intercept("GET", testPageUrl, {
    body: testPageSource,
    headers: { "content-type": "text/html" },
  }).as("dynamicPage");

  cy.visit(testPageUrl);
  cy.title().should("include", "Metabase Embed Test");

  return getIframeBody(iframeSelector);
}

interface PostMessageOptions {
  /**
   * CSS selector for the iframe to post the message to
   * @example `iframe[src*="localhost:4000/dashboard"]`
   */
  iframeSelector: string;

  /**
   * Something like `{ metabase: { type: "location", location: "/dashboard/9999990" } }` for instance
   */
  messageData: any;
}

export function postMessageToIframe(options: PostMessageOptions) {
  const { messageData, iframeSelector } = options;

  // this madness is necessary to simulate a real MessageEvent coming from the parent window
  // because in frontend/src/metabase/lib/embed.js we check e.source === window.parent
  cy.get(iframeSelector)
    .should("be.visible")
    .then(($iframe) => {
      const iframeEl = $iframe[0] as HTMLIFrameElement;
      // Get the actual parent window from the iframe's perspective
      const actualParent = iframeEl.ownerDocument.defaultView;
      const targetWin = iframeEl.contentWindow;

      if (!actualParent || !targetWin) {
        throw new Error("Could not access iframe or its parent window");
      }

      // Create a MessageEvent manually with the correct source
      const event = new MessageEvent("message", {
        data: messageData,
        origin: actualParent.location.origin,
        source: actualParent,
      });

      targetWin.dispatchEvent(event);
    });

  return getIframeBody(iframeSelector);
}

/**
 * Base HTML template for embedding test pages
 */
function getInteractiveHtml({ dashboardId }: BaseEmbedTestPageOptions) {
  const MB_BASE_URL = "http://localhost:4000";

  const url = `${MB_BASE_URL}/dashboard/${dashboardId}`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Metabase Embed Test</title>

      <style>
        body {
          margin: 0;
        }
      </style>
    </head>
    <body>
      <iframe
        src="${url}"
        style="position: absolute; height: 100%; width:99%; border: none; border: 2px solid red"
        allowtransparency
      ></iframe>
    </body>
    </html>
  `;
}
