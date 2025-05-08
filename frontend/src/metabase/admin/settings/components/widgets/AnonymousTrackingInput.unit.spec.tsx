import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { UndoListing } from "metabase/containers/UndoListing";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";

import * as analytics from "../../analytics";

import { AnonymousTrackingInput } from "./AnonymousTrackingInput";

const trackingFN = jest.spyOn(analytics, "trackTrackingPermissionChanged");

const setup = ({ value }: { value: boolean }) => {
  const settings = createMockSettings({
    "anon-tracking-enabled": value,
  });

  setupPropertiesEndpoints(settings);
  setupUpdateSettingEndpoint();
  setupSettingsEndpoints([
    createMockSettingDefinition({
      key: "anon-tracking-enabled",
      description: "Enable the collection of anonymous usage data",
      value: false,
    }),
  ]);

  return renderWithProviders(
    <div>
      <AnonymousTrackingInput />
      <UndoListing />
    </div>,
  );
};

describe("AnonymousTrackingInput", () => {
  it("should show an anonymous tracking toggle", async () => {
    setup({ value: true });
    expect(await screen.findByText("Anonymous Tracking")).toBeInTheDocument();
    expect(
      await screen.findByText(/Enable the collection of anonymous usage data/),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("should toggle the anonymous tracking setting off", async () => {
    setup({ value: true });
    await userEvent.click(screen.getByRole("switch"));
    expect(trackingFN).toHaveBeenCalledWith(false);

    const [putUrl, putDetails] = await findPut();
    expect(putUrl).toMatch(/\/api\/setting\/anon-tracking-enabled/);
    expect(putDetails).toEqual({ value: false });

    expect(await screen.findByRole("switch")).not.toBeChecked();
  });

  it("should toggle the anonymous tracking setting on", async () => {
    setup({ value: false });
    await userEvent.click(screen.getByRole("switch"));

    const [putUrl, putDetails] = await findPut();
    expect(putUrl).toMatch(/\/api\/setting\/anon-tracking-enabled/);
    expect(putDetails).toEqual({ value: true });
    expect(trackingFN).toHaveBeenCalledWith(true);

    expect(await screen.findByRole("switch")).toBeChecked();
  });
});

async function findPut() {
  const calls = fetchMock.calls();
  const [putUrl, putDetails] =
    calls.find((call) => call[1]?.method === "PUT") ?? [];

  const body = ((await putDetails?.body) as string) ?? "{}";

  return [putUrl, JSON.parse(body)];
}
