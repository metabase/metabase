import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";

import { LegaleseStep } from "./LegaleseStep";

const setup = () => {
  const goToNextStep = jest.fn();

  setupSettingsEndpoints([
    createMockSettingDefinition({
      key: "show-static-embed-terms",
      value: true,
    }),
  ]);

  setupPropertiesEndpoints(createMockSettings());

  renderWithProviders(<LegaleseStep goToNextStep={goToNextStep} />);

  return { goToNextStep };
};

describe("LegaleseStep", () => {
  it("should render", () => {
    setup();

    expect(screen.getByText("First, some legalese")).toBeInTheDocument();
    expect(
      screen.getByText('By clicking "Agree and continue" you\'re agreeing to'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `When you embed charts or dashboards from Metabase in your own application that application isn't subject to the Affero General Public License that covers the rest of Metabase, provided you keep the Metabase logo and the "Powered by Metabase" visible on those embeds.`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "You should, however, read the license text linked above as that is the actual license that you will be agreeing to by enabling this feature.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Agree and continue")).toBeInTheDocument();
  });

  it("calls goToNextStep and updates setting on clicking 'Agree and continue'", async () => {
    fetchMock.put("path:/api/setting/show-static-embed-terms", 204);

    const { goToNextStep } = setup();
    await userEvent.click(screen.getByText("Agree and continue"));

    const settingPutCalls = fetchMock.calls(
      "path:/api/setting/show-static-embed-terms",
    );

    expect(settingPutCalls.length).toBe(1);
    expect(await settingPutCalls[0]?.request?.json()).toEqual({
      value: false,
    });
    expect(goToNextStep).toHaveBeenCalled();
  });
});
