import userEvent from "@testing-library/user-event";

import { setupLastDownloadFormatEndpoints } from "__support__/server-mocks";
import { screen, waitForLoaderToBeRemoved } from "__support__/ui";
import { getFont } from "metabase/styled-components/selectors";

import { type SetupOpts, setup } from "./setup";

const FAKE_UUID = "123456";

const QUESTION_NAME = "Public question";

function setupCommon(opts?: Partial<SetupOpts>) {
  return setup({
    ...opts,
    questionName: QUESTION_NAME,
    uuid: FAKE_UUID,
  });
}

describe("PublicOrEmbeddedQuestion", () => {
  beforeEach(() => {
    setupLastDownloadFormatEndpoints();
  });

  it("should render data", async () => {
    await setupCommon();
    expect(await screen.findByText("John W.")).toBeInTheDocument();
  });

  it("should update card settings when visualization component changes them (metabase#37429)", async () => {
    await setupCommon();

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

  it("should apply the font from the `#font` hash parameter (metabase#45638)", async () => {
    const { store } = await setupCommon({ hash: { font: "Roboto" } });

    expect(getFont(store.getState())).toBe("Roboto");
  });
});
