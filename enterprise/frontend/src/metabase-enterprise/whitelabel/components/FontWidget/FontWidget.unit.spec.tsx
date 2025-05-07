import userEvent from "@testing-library/user-event";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { setupContentTranslationEndpoints } from "__support__/server-mocks/content-translation";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { findRequests } from "__support__/utils";
import type { EnterpriseSettings } from "metabase-types/api";
import { createMockSettings } from "metabase-types/api/mocks";

import { FontWidget } from "./FontWidget";

const setup = async (
  initialFont = "Lato",
  overrides?: Partial<EnterpriseSettings>,
  setByEnvVar = false,
) => {
  const settings = createMockSettings({
    "available-fonts": ["Lato", "Lora", "Comic Sans"],
    "application-font": initialFont,
    "application-font-files": initialFont === "Custom…" ? [] : null,
    ...overrides,
  });
  setupPropertiesEndpoints(settings);
  setupContentTranslationEndpoints();
  setupSettingsEndpoints([
    {
      key: "application-font",
      value: initialFont,
      is_env_setting: setByEnvVar,
      description: "Pick a font dude",
      env_name: "METABASE_APPLICATION_FONT",
    },
    {
      key: "application-font-files",
      value: initialFont === "Custom…" ? [] : null,
    },
  ]);
  setupUpdateSettingEndpoint();

  renderWithProviders(<FontWidget />);
  await screen.findByText("Font");
  return waitFor(async () => {
    const gets = await findRequests("GET");
    expect(gets).toHaveLength(2);
  });
};

describe("FontWidget", () => {
  it("should display a message if it is set by an env var", async () => {
    await setup("Lato", {}, true);
    expect(
      await screen.findByText(/This has been set by the/),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("METABASE_APPLICATION_FONT"),
    ).toBeInTheDocument();
  });

  it("should set a built-in font from a built-in font", async () => {
    await setup("Lato");
    await clickSelect("Lato", "Lora");

    await expectPuts(2);
    const [{ url, body }, { url: url2, body: body2 }] =
      await findRequests("PUT");

    expect(url).toMatch(/application-font/);
    expect(body).toEqual({
      value: "Lora",
    });
    expect(url2).toMatch(/application-font-files/);
    expect(body2).toEqual({
      value: null,
    });
  });

  it("should set a custom font from a built-in font", async () => {
    await setup("Lato");
    await clickSelect("Lato", "Custom…");

    await expectPuts(2);
    const [{ url, body }, { url: url2, body: body2 }] =
      await findRequests("PUT");

    expect(url).toMatch(/application-font/);
    expect(body).toEqual({
      value: "Lato",
    });
    expect(url2).toMatch(/application-font-files/);
    expect(body2).toEqual({
      value: [],
    });
  });

  it("should set a built-in font from a custom font", async () => {
    await setup("Custom…");
    await clickSelect("Custom…", "Comic Sans");

    await expectPuts(2);
    const [{ url, body }, { url: url2, body: body2 }] =
      await findRequests("PUT");

    expect(url).toMatch(/application-font/);
    expect(body).toEqual({
      value: "Comic Sans",
    });
    expect(url2).toMatch(/application-font-files/);
    expect(body2).toEqual({
      value: null,
    });
  });

  describe("font files", () => {
    it("should not show custom font inputs when built in font is selected", async () => {
      await setup("Lato");
      expect(screen.queryByTestId("font-files-widget")).not.toBeInTheDocument();
    });

    it("should show custom font inputs when custom font is selected", async () => {
      await setup("Custom…");
      expect(screen.getByTestId("font-files-widget")).toBeInTheDocument();
    });

    it("should update font urls", async () => {
      await setup("Custom…");
      const filesTable = screen.getByTestId("font-files-widget");
      const inputs = within(filesTable).getAllByRole("textbox");
      expect(inputs).toHaveLength(3);

      await userEvent.type(inputs[0], "https://example.com/regular.ttf");
      await userEvent.tab();
      await expectPuts(1);
      const body1 = await getLastPutBody();
      expect(body1).toEqual({
        value: [
          {
            src: "https://example.com/regular.ttf",
            fontWeight: 400,
            fontFormat: "truetype",
          },
        ],
      });

      await userEvent.type(inputs[1], "https://example.com/bold.woff");
      await userEvent.tab();
      await expectPuts(2);
      const body2 = await getLastPutBody();
      expect(body2).toEqual({
        value: [
          {
            src: "https://example.com/bold.woff",
            fontWeight: 700,
            fontFormat: "woff",
          },
        ],
      });

      await userEvent.type(inputs[2], "https://example.com/superbold.woff2");
      await userEvent.tab();
      await expectPuts(3);
      const body3 = await getLastPutBody();
      expect(body3).toEqual({
        value: [
          {
            src: "https://example.com/superbold.woff2",
            fontWeight: 900,
            fontFormat: "woff2",
          },
        ],
      });

      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(3);
      puts.forEach(({ url }) => {
        expect(url).toMatch(/application-font-files/);
      });
    });

    it("should remove a font file", async () => {
      const customFonts = [
        {
          src: "https://myfonts.com/abc.png",
          fontWeight: 400,
          fontFormat: "woff2",
        },
        {
          src: "https://myfonts.com/def.woff",
          fontWeight: 700,
          fontFormat: "woff",
        },
        {
          src: "https://myfonts.com/abc.ttf",
          fontWeight: 900,
          fontFormat: "truetype",
        },
      ] as EnterpriseSettings["application-font-files"];

      await setup("Custom…", {
        "application-font-files": customFonts,
      });

      const filesTable = screen.getByTestId("font-files-widget");
      const inputs = within(filesTable).getAllByRole("textbox");

      expect(inputs).toHaveLength(3);
      await userEvent.clear(inputs[0]);
      await userEvent.tab();

      await expectPuts(1);
      const body = await getLastPutBody();
      expect(body).toEqual({ value: customFonts?.slice(1) });
    });

    it("should add a font file with a query param", async () => {
      const url = "https://example.com/regular.ttf?hash=1337h4x0r";
      await setup("Custom…");
      const filesTable = screen.getByTestId("font-files-widget");
      const inputs = within(filesTable).getAllByRole("textbox");
      expect(inputs).toHaveLength(3);

      await userEvent.type(inputs[0], url);
      await userEvent.tab();
      await expectPuts(1);
      const body1 = await getLastPutBody();
      expect(body1).toEqual({
        value: [
          {
            src: url,
            fontWeight: 400,
            fontFormat: "truetype",
          },
        ],
      });
    });

    it("should accept a font file with an invalid url", async () => {
      const url = "there's no font here";
      await setup("Custom…");
      const filesTable = screen.getByTestId("font-files-widget");
      const inputs = within(filesTable).getAllByRole("textbox");
      expect(inputs).toHaveLength(3);

      await userEvent.type(inputs[0], url);
      await userEvent.tab();
      await expectPuts(1);
      const body1 = await getLastPutBody();
      expect(body1).toEqual({
        value: [
          {
            src: url,
            fontWeight: 400,
            fontFormat: "woff2",
          },
        ],
      });
    });
  });
});

async function clickSelect(from: string, to: string) {
  const input = await screen.findByRole("textbox", { name: "Font" });
  expect(input).toHaveValue(from);
  await userEvent.click(input);
  const option = await screen.findByText(to);
  return userEvent.click(option);
}

async function expectPuts(cnt: number) {
  return waitFor(async () => {
    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(cnt);
  });
}

async function getLastPutBody() {
  const puts = await findRequests("PUT");
  return puts[puts.length - 1].body;
}
