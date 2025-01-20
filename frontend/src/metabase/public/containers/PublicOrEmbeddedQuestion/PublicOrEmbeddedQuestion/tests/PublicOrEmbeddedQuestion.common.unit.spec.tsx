import userEvent from "@testing-library/user-event";

import { screen, waitForLoaderToBeRemoved } from "__support__/ui";
import { useSetEmbedFont } from "metabase/public/hooks";

import { type SetupOpts, setup } from "./setup";

jest.mock("metabase/public/hooks/use-set-embed-font", () => ({
  useSetEmbedFont: jest.fn(),
}));

const FAKE_UUID = "123456";

const QUESTION_NAME = "Public question";

async function setupCommon(opts?: Partial<SetupOpts>) {
  const useSetEmbedFontMock = useSetEmbedFont as jest.Mock;

  await setup({
    ...opts,
    questionName: QUESTION_NAME,
    uuid: FAKE_UUID,
  });

  return { useSetEmbedFontMock };
}

describe("PublicOrEmbeddedQuestion", () => {
  it("sets embed font", async () => {
    const { useSetEmbedFontMock } = await setupCommon();

    expect(useSetEmbedFontMock).toHaveBeenCalled();
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
});
