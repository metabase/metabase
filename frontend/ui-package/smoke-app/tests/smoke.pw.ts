import { type Locator, type Page, expect, test } from "@playwright/test";

const SCHEMES = ["light", "dark"] as const;
type Scheme = (typeof SCHEMES)[number];

// Dayjs `w` (week of year) and `L` (localized date), locale `en`, for the first day of each 2024 quarter.
// `L` needs the localizedFormat plugin, which only the app's Day.js setup registers.
const EXPECTED_QUARTERS = [
  "Q1 week 1 · 01/01/2024",
  "Q2 week 14 · 04/01/2024",
  "Q3 week 27 · 07/01/2024",
  "Q4 week 40 · 10/01/2024",
];

const expectScheme = (page: Page, scheme: Scheme) =>
  expect(page.locator("html")).toHaveAttribute(
    "data-mantine-color-scheme",
    scheme,
  );

async function openPage(page: Page, scheme: Scheme) {
  const problems: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (
      message.type() === "error" ||
      text.includes("Error while trying to get env")
    ) {
      problems.push(`console ${message.type()}: ${text}`);
    }
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));

  await page.goto(`/?scheme=${scheme}`);
  await page.getByTestId("page").waitFor();
  await page.evaluate(() => document.fonts.ready);
  return problems;
}

// Resolves a CSS variable to a computed value by letting the browser paint a probe.
const resolveColorVar = (page: Page, variable: string) =>
  page.evaluate((name) => {
    if (
      !getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    ) {
      throw new Error(`Missing CSS variable ${name}`);
    }
    const probe = document.createElement("div");
    probe.style.color = `var(${name})`;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved;
  }, variable);

const computedStyle = (
  page: Page,
  selector: string,
  property: "backgroundColor" | "color" | "fontFamily",
) =>
  page.locator(selector).evaluate((el, p) => getComputedStyle(el)[p], property);

const isTransparent = (color: string) =>
  color === "transparent" || /rgba\(.*,\s*0\)$/.test(color);

// True when the element at the centre of `selector` is inside it. Tooltips are
// `pointer-events: none`, which hit testing skips, so it is lifted first.
const isOnTop = (locator: Locator) =>
  locator.evaluate((el) => {
    if (el instanceof HTMLElement) {
      el.style.pointerEvents = "auto";
    }
    const { x, y, width, height } = el.getBoundingClientRect();
    const top = document.elementFromPoint(x + width / 2, y + height / 2);
    return top != null && el.contains(top);
  });

for (const scheme of SCHEMES) {
  test.describe(`${scheme} scheme`, () => {
    test(`@release Button uses the theme colors and font (${scheme})`, async ({
      page,
    }) => {
      await openPage(page, scheme);
      await expectScheme(page, scheme);

      const expected = await resolveColorVar(
        page,
        "--mb-color-button-filled-brand-default",
      );
      const background = await computedStyle(
        page,
        '[data-testid="button-filled"]',
        "backgroundColor",
      );
      expect(isTransparent(background)).toBe(false);
      expect(background).toBe(expected);
      expect(
        await computedStyle(
          page,
          '[data-testid="button-filled"]',
          "fontFamily",
        ),
      ).toMatch(/^"?Lato/);

      const [brand, text] = await page.evaluate(() => {
        const read = (name: string) =>
          getComputedStyle(document.documentElement)
            .getPropertyValue(name)
            .trim();
        return [read("--mb-color-core-brand"), read("--mb-color-text-primary")];
      });
      expect(brand).not.toBe("");
      expect(text).not.toBe("");
    });

    test(`body uses the page colors (${scheme})`, async ({ page }) => {
      await openPage(page, scheme);
      expect(await computedStyle(page, "body", "color")).toBe(
        await resolveColorVar(page, "--mb-color-text-primary"),
      );
      expect(await computedStyle(page, "body", "backgroundColor")).toBe(
        await resolveColorVar(page, "--mb-color-background_page-secondary"),
      );
    });

    test(`Lato is loaded from fonts.css (${scheme})`, async ({ page }) => {
      await openPage(page, scheme);
      const loaded = await page.evaluate(async () => {
        await document.fonts.load("14px Lato");
        // `check` is also true when no @font-face matches, so look at the faces too.
        const faces = [...document.fonts].filter(
          (face) =>
            face.family.replace(/"/g, "") === "Lato" &&
            face.status === "loaded",
        );
        return {
          check: document.fonts.check("14px Lato"),
          loadedFaces: faces.length,
        };
      });
      expect(loaded.check).toBe(true);
      expect(loaded.loadedFaces).toBeGreaterThan(0);
    });

    test(`@release Modal is visible, opaque, on top and uses Lato (${scheme})`, async ({
      page,
    }) => {
      await openPage(page, scheme);
      await expectScheme(page, scheme);
      await page.getByTestId("open-modal").click();
      const modal = page.getByRole("dialog");
      await expect(modal).toBeVisible();
      await expect(modal).toHaveCSS("opacity", "1");

      const selector = '[role="dialog"]';
      expect(
        isTransparent(await computedStyle(page, selector, "backgroundColor")),
      ).toBe(false);
      expect(await computedStyle(page, selector, "fontFamily")).toMatch(
        /^"?Lato/,
      );
      expect(await isOnTop(page.locator(selector))).toBe(true);

      // The dialog's z-index comes from `--mb-overlay-z-index`, which the provider writes.
      const variable = await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--mb-overlay-z-index")
          .trim(),
      );
      expect(variable).toMatch(/^\d+$/);
      await expect(modal).toHaveCSS("z-index", variable);
    });

    test(`Select dropdown is visible, opaque and on top (${scheme})`, async ({
      page,
    }) => {
      await openPage(page, scheme);
      await page.getByTestId("select").click();
      const listbox = page.getByRole("listbox");
      await expect(listbox).toBeVisible();
      await expect(page.getByRole("option", { name: "One" })).toBeVisible();

      const selector = '[role="listbox"]';
      const dropdown = listbox.locator(
        "xpath=ancestor::*[contains(@class, 'dropdown')][1]",
      );
      expect(
        isTransparent(
          await dropdown.evaluate((el) => getComputedStyle(el).backgroundColor),
        ),
      ).toBe(false);
      expect(await isOnTop(page.locator(selector))).toBe(true);
    });

    test(`Tooltip is visible, opaque and on top (${scheme})`, async ({
      page,
    }) => {
      await openPage(page, scheme);
      const tooltip = page.getByRole("tooltip");
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toHaveText("Tooltip label");
      await expect(tooltip).toHaveCSS("opacity", "1");

      const selector = '[role="tooltip"]';
      expect(
        isTransparent(await computedStyle(page, selector, "backgroundColor")),
      ).toBe(false);
      expect(await isOnTop(page.locator(selector))).toBe(true);
      await expect(page.getByTestId("tooltip-target")).toBeVisible();
    });

    test(`QuarterPicker formats a custom week and localized-date format (${scheme})`, async ({
      page,
    }) => {
      await openPage(page, scheme);
      const picker = page.getByTestId("quarter-picker");
      for (const label of EXPECTED_QUARTERS) {
        await expect(picker.getByText(label, { exact: true })).toBeVisible();
      }
    });

    test(`the table icon renders an SVG path (${scheme})`, async ({ page }) => {
      await openPage(page, scheme);
      const icon = page.getByTestId("icon-table");
      await expect(icon).toBeVisible();
      await expect(icon.locator("path").first()).toHaveAttribute("d", /\S/);
    });

    test(`color() returns the brand variable (${scheme})`, async ({ page }) => {
      await openPage(page, scheme);
      await expect(page.getByTestId("brand-color")).toHaveText(
        "var(--mb-color-core-brand)",
      );
      expect(
        await computedStyle(page, '[data-testid="brand-color"]', "color"),
      ).toBe(await resolveColorVar(page, "--mb-color-core-brand"));
    });

    test(`loads without console errors (${scheme})`, async ({ page }) => {
      const problems = await openPage(page, scheme);
      await page.getByTestId("select").click();
      await expect(page.getByRole("listbox")).toBeVisible();
      expect(problems).toEqual([]);
    });
  });
}

test("@release a native Mantine Select works outside the Metabase provider", async ({
  page,
}) => {
  await page.goto("/?native-select");
  const select = page.getByRole("textbox", { name: "Native select" });
  await expect(select).toBeVisible();
  await select.click();
  await page.getByRole("option", { name: "Native option" }).click();
  await expect(select).toHaveValue("Native option");
});

test("@release a Drawer opened from a custom-layer Modal can be used", async ({
  page,
}) => {
  await page.goto("/?high-overlay&drawer");
  await page.getByTestId("open-modal").click();
  await page.getByRole("button", { name: "Open drawer" }).click();
  const drawer = page.getByRole("dialog", { name: "Nested drawer" });
  await expect(drawer).toBeVisible();
  await expect.poll(() => isOnTop(drawer)).toBe(true);
  await drawer.getByRole("button", { name: "Close nested drawer" }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole("dialog", { name: "Modal title" })).toBeVisible();
});

test("a portalled Select can be used inside a custom modal layer", async ({
  page,
}) => {
  await page.goto("/?high-overlay");
  await page.getByTestId("open-modal").click();
  const select = page.getByLabel("Modal select");
  await select.click();
  const option = page.getByRole("option", { name: "Beta" });
  await expect(option).toBeVisible();
  await expect.poll(() => isOnTop(option)).toBe(true);
  await option.click();
  await expect(select).toHaveValue("Beta");
});

test("a tooltip stays above a modal with a custom overlay z-index", async ({
  page,
}) => {
  await page.goto("/?high-overlay");
  await page.getByTestId("open-modal").click();
  const tooltip = page
    .getByRole("tooltip")
    .filter({ hasText: "Modal tooltip" });
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveCSS("z-index", "10000");
  await expect.poll(() => isOnTop(tooltip)).toBe(true);
});

test("a custom tooltip z-index takes precedence", async ({ page }) => {
  await page.goto("/?high-overlay&tooltip-override");
  await page.getByTestId("open-modal").click();
  await expect(
    page.getByRole("tooltip").filter({ hasText: "Modal tooltip" }),
  ).toHaveCSS("z-index", "11000");
});

test("preserves tooltip defaults returned by a theme callback", async ({
  page,
}) => {
  await page.goto("/?high-overlay&tooltip-callback");
  await page.getByTestId("open-modal").click();
  const tooltip = page
    .getByTestId("callback-tooltip")
    .filter({ hasText: "Modal tooltip" });
  await expect(tooltip).toHaveCSS("z-index", "11000");
  await expect(tooltip).toHaveCSS(
    "background-color",
    await resolveColorVar(page, "--mb-color-tooltip-background"),
  );
});

test("a floating tooltip stays above a custom modal layer", async ({
  page,
}) => {
  await page.goto("/?high-overlay");
  await page.getByTestId("open-modal").click();
  await page.getByRole("button", { name: "Floating tooltip target" }).hover();
  const tooltip = page.getByText("Floating tooltip", { exact: true });
  await expect(tooltip).toBeVisible();
  await expect.poll(() => isOnTop(tooltip)).toBe(true);
});

test("@release light and dark resolve different colors", async ({ page }) => {
  await page.goto("/?theme-controls&dark-font=Georgia%2Cserif");
  const scheme = page.getByLabel("Resolved color scheme");
  const switchScheme = page.getByRole("button", {
    name: "Change provider scheme",
  });
  const light = await resolveColorVar(
    page,
    "--mb-color-background_page-secondary",
  );
  await expectScheme(page, "light");
  await page
    .getByRole("button", { name: "Try changing scheme through the hook" })
    .click();
  await expect(scheme).toHaveText("light");
  await expectScheme(page, "light");

  await switchScheme.click();
  await expectScheme(page, "dark");
  await expect(scheme).toHaveText("dark");
  await expect(page.locator("body")).not.toHaveCSS("background-color", light);
  await expect(page.locator("body")).toHaveCSS("font-family", "Georgia, serif");
  await page.getByTestId("open-modal").click();
  const modal = page.getByRole("dialog");
  await expect(modal).toHaveCSS("font-family", "Georgia, serif");
  await modal.getByRole("button", { name: "Close" }).click();
  await expect(modal).toBeHidden();

  await switchScheme.click();
  await expectScheme(page, "light");
  await expect(scheme).toHaveText("light");
  await expect(page.locator("body")).toHaveCSS("background-color", light);
  await expect(page.locator("body")).toHaveCSS("font-family", /Lato/);
});
