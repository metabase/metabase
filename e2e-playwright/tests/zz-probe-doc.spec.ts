import {
  ACCOUNTS_COUNT_BY_CREATED_AT,
  addToDocument,
  commandSuggestionDialog,
  createCard,
  createDocument,
  documentContent,
  getDocumentCard,
  visitDocument,
} from "../support/documents-core";
import { test, expect } from "../support/fixtures";

test.describe("probe", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("probe early height", async ({ page, mb }) => {
    const doc = await createDocument(mb.api, {
      name: "Foo Document",
      document: { content: [], type: "doc" },
      collection_id: null,
    });
    await createCard(mb.api, ACCOUNTS_COUNT_BY_CREATED_AT);
    await visitDocument(page, doc.id);

    await documentContent(page).click();
    await addToDocument(page, "/", false);
    await addToDocument(page, "Accounts", false);
    await expect(commandSuggestionDialog(page)).toContainText(
      ACCOUNTS_COUNT_BY_CREATED_AT.name,
    );
    await page.keyboard.press("ArrowDown");

    // Sample the card's height from the instant the embed attaches — this is
    // when Cypress's getDocumentCard().then() would fire.
    const samples = page.evaluate(() => {
      return new Promise<Array<[number, number, number]>>((resolve) => {
        const out: Array<[number, number, number]> = [];
        const t0 = performance.now();
        const tick = () => {
          const el = document.querySelector('[data-testid="document-card-embed"]');
          if (el) {
            const r = el.getBoundingClientRect();
            // [ms since first seen, border-box height, jQuery-style content height]
            const cs = getComputedStyle(el);
            const contentH =
              r.height -
              parseFloat(cs.paddingTop) -
              parseFloat(cs.paddingBottom) -
              parseFloat(cs.borderTopWidth) -
              parseFloat(cs.borderBottomWidth);
            out.push([Math.round(performance.now() - t0), r.height, contentH]);
          }
          if (performance.now() - t0 < 6000) {
            requestAnimationFrame(tick);
          } else {
            resolve(out);
          }
        };
        tick();
      });
    });

    await addToDocument(page, "\n", false);
    const series = await samples;

    // condense: only print when height changes
    const changes: string[] = [];
    let last = -1;
    for (const [t, h, ch] of series) {
      if (h !== last) {
        changes.push(`t=${t}ms borderBoxH=${h} contentH=${ch.toFixed(1)}`);
        last = h;
      }
    }
    console.log("PROBE height timeline (first sample = when Cypress .then() fires):");
    console.log(changes.join("\n"));
    console.log("PROBE total samples:", series.length);

    const card = getDocumentCard(page, ACCOUNTS_COUNT_BY_CREATED_AT.name);
    console.log("PROBE final height:", (await card.boundingBox())?.height);
  });
});
