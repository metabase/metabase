import userEvent from "@testing-library/user-event";

import {
  getIcon,
  queryIcon,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { type SetupOpts, setup } from "./SetupOpts";

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
  it("should render data", async () => {
    await setupPremium();
    expect(await screen.findByText("John W.")).toBeInTheDocument();
  });

  it("should update card settings when visualization component changes them (metabase#37429)", async () => {
    await setupPremium();

    await waitForLoaderToBeRemoved();

    await userEvent.click(
      await screen.findByRole("button", {
        name: /update settings/i,
      }),
    );

    await waitForLoaderToBeRemoved();

    expect(screen.getByTestId("settings")).toHaveTextContent(
      JSON.stringify({ foo: "bar" }),
    );
  });

  describe("downloads flag", () => {
    it("should allow downloading the results when downloads are enabled", async () => {
      await setupPremium({ hash: { downloads: "true" } });
      await waitForLoaderToBeRemoved();

      await userEvent.click(getIcon("download"));

      expect(
        within(screen.getByRole("dialog")).getByRole("heading", {
          name: /download/i,
        }),
      ).toBeInTheDocument();
    });

    it("should not allow downloading results when downloads are enabled", async () => {
      await setupPremium({ hash: { downloads: "false" } });

      await waitForLoaderToBeRemoved();

      expect(queryIcon("download")).not.toBeInTheDocument();
    });
  });
});
