/**
 * Helpers for the models/reproductions-3 spec port — spec-local `H` helpers /
 * intercept-count patterns not already covered by the shared modules.
 *
 * Kept in its own module (parallel porting agents don't touch shared files);
 * fold into models.ts on the consolidation pass. Everything else is imported
 * read-only from models.ts / models-core.ts / models-reproductions-2.ts /
 * notebook.ts etc.
 */
import type { Page } from "@playwright/test";

/**
 * Port of the `cy.intercept("GET", "/api/card/*").as("card")` +
 * `cy.get("@card.all").should("have.length.lte", 2)` pattern in issue 31905:
 * count every GET /api/card/:id request over the page's lifetime. The glob
 * `/api/card/*` matches a single trailing segment, so it counts the card-load
 * GET but not /api/card/:id/query.
 */
export function countCardRequests(page: Page): () => number {
  let count = 0;
  page.on("request", (request) => {
    if (
      request.method() === "GET" &&
      /^\/api\/card\/[^/]+$/.test(new URL(request.url()).pathname)
    ) {
      count += 1;
    }
  });
  return () => count;
}
