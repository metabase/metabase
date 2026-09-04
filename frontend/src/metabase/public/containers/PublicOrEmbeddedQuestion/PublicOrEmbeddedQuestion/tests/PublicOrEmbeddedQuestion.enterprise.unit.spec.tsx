import userEvent from "@testing-library/user-event";

import { setupLastDownloadFormatEndpoints } from "__support__/server-mocks";
import { getIcon, screen, within } from "__support__/ui";

import { type SetupOpts, setup } from "./setup";

// The catalogue is imported rather than fetched, so the load is observed through
// `loadLocalization` instead of through a request.
const loadLocalizationSpy = jest.fn();
jest.mock("metabase/utils/localization", () => {
  const actual = jest.requireActual("metabase/utils/localization");
  return {
    ...actual,
    loadLocalization: (locale: string) => {
      loadLocalizationSpy(locale);
      return actual.loadLocalization(locale);
    },
  };
});

const FAKE_UUID = "123456";

const QUESTION_NAME = "Public question";

function setupEnterprise(opts?: Partial<SetupOpts>) {
  return setup({
    ...opts,
    questionName: QUESTION_NAME,
    uuid: FAKE_UUID,
  });
}

describe("PublicOrEmbeddedQuestion", () => {
  beforeEach(() => {
    loadLocalizationSpy.mockClear();
    setupLastDownloadFormatEndpoints();
  });

  describe("downloads flag", () => {
    it("should allow downloading the results when downloads are enabled", async () => {
      await setupEnterprise({ hash: { downloads: "true" } });

      await userEvent.click(getIcon("download"));

      expect(
        within(screen.getByRole("dialog")).getByRole("heading", {
          name: /download/i,
        }),
      ).toBeInTheDocument();
    });

    it('should not hide download button when downloads are disabled without "whitelabel" feature', async () => {
      await setupEnterprise({ hash: { downloads: "false" } });

      expect(getIcon("download")).toBeInTheDocument();
    });
  });

  describe("locale hash parameter on static embeds (metabase#50182)", () => {
    it('should set the locale to "en" by default', async () => {
      await setupEnterprise();

      expect(
        await screen.findByRole("button", { name: "Download results" }),
      ).toBeInTheDocument();
    });

    it('should not set the locale to "ko" without "whitelabel" feature', async () => {
      const expectedLocale = "ko";
      await setupEnterprise({ hash: { locale: expectedLocale } });

      await userEvent.hover(getIcon("download"));

      expect(loadLocalizationSpy).not.toHaveBeenCalled();
    });
  });
});
