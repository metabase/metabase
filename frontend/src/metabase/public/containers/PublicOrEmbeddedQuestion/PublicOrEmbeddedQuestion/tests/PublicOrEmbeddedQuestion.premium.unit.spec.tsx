import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { getIcon, queryIcon, screen, within } from "__support__/ui";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { type SetupOpts, setup } from "./setup";

const FAKE_UUID = "123456";

const QUESTION_NAME = "Public question";

function setupPremium(opts?: Partial<SetupOpts>) {
  return setup({
    ...opts,
    hasEnterprisePlugins: true,
    tokenFeatures: createMockTokenFeatures({ whitelabel: true }),
    questionName: QUESTION_NAME,
    uuid: FAKE_UUID,
  });
}

describe("PublicOrEmbeddedQuestion", () => {
  describe("downloads flag", () => {
    it("should allow downloading the results when downloads are enabled", async () => {
      await setupPremium({ hash: { downloads: "true" } });

      await userEvent.click(getIcon("download"));

      expect(
        within(screen.getByRole("dialog")).getByRole("heading", {
          name: /download/i,
        }),
      ).toBeInTheDocument();
    });

    it("should not allow downloading results when downloads are disabled", async () => {
      await setupPremium({ hash: { downloads: "false" } });

      expect(queryIcon("download")).not.toBeInTheDocument();
    });
  });

  describe("locale hash parameter on static embeds (metabase#50182)", () => {
    it('should set the locale to "en" by default', async () => {
      await setupPremium();

      await userEvent.hover(getIcon("download"));

      expect(screen.getByText("Download full results")).toBeInTheDocument();
    });

    it('should set the locale to "ko"', async () => {
      const expectedLocale = "ko";
      await setupPremium({ hash: { locale: expectedLocale } });

      await userEvent.hover(getIcon("download"));

      expect(
        fetchMock.calls(`path:/app/locales/${expectedLocale}.json`),
      ).toHaveLength(1);
    });
  });
});
