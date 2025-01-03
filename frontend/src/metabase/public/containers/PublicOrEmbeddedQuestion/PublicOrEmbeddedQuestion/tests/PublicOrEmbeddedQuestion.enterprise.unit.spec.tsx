import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { getIcon, screen, within } from "__support__/ui";

import { type SetupOpts, setup } from "./setup";

const FAKE_UUID = "123456";

const QUESTION_NAME = "Public question";

function setupEnterprise(opts?: Partial<SetupOpts>) {
  return setup({
    ...opts,
    hasEnterprisePlugins: true,
    questionName: QUESTION_NAME,
    uuid: FAKE_UUID,
  });
}

describe("PublicOrEmbeddedQuestion", () => {
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

      await userEvent.hover(getIcon("download"));

      expect(screen.getByText("Download full results")).toBeInTheDocument();
    });

    it('should not set the locale to "ko" without "whitelabel" feature', async () => {
      const expectedLocale = "ko";
      await setupEnterprise({ hash: { locale: expectedLocale } });

      await userEvent.hover(getIcon("download"));

      expect(
        fetchMock.calls(`path:/app/locales/${expectedLocale}.json`),
      ).toHaveLength(0);
    });
  });
});
