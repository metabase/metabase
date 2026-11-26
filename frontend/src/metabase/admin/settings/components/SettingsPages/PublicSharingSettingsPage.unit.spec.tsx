import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupListPublicDocumentsEndpoint,
  setupSettingsEndpoints,
  setupStatefulPublicLinksEndpoints,
  setupStatefulSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import type {
  GetPublicAction,
  GetPublicCard,
  GetPublicDashboard,
  SettingKey,
} from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";

import { PublicSharingSettingsPage } from "./PublicSharingSettingsPage";

const SITE_URL = "http://metabase.example.com";

const PUBLIC_ACTIONS: GetPublicAction[] = [
  {
    id: 1,
    name: "Test Action",
    model_id: 1,
    public_uuid: "e4f2be29-78df-4c35-9cc4-98d04091ff13",
  },
  {
    id: 12,
    name: "Public action",
    model_id: 7,
    public_uuid: "0b7c7a3e-8d3c-4a54-9a4b-0b8a3c1e9d21",
  },
];

const PUBLIC_CARDS: GetPublicCard[] = [
  {
    name: "Test Question",
    id: 2,
    public_uuid: "11bf0e18-34d2-4630-865a-c0bebb75c8b3",
  },
  {
    name: "Public question",
    id: 22,
    public_uuid: "7d1f4a52-3c1e-4c6b-a1f9-5e2b9c8d7a10",
  },
];

const PUBLIC_DASHBOARDS: GetPublicDashboard[] = [
  {
    name: "Test Dashboard",
    id: 3,
    public_uuid: "16a4568d-c328-4306-9c4b-ec8fbd6e4c8e",
  },
  {
    name: "Public dashboard",
    id: 33,
    public_uuid: "c2e5a8d1-6f4b-4e3a-8c9d-1a2b3c4d5e6f",
  },
];

const setup = async (enablePublicSharing = false) => {
  const settings = createMockSettings({
    "enable-public-sharing": enablePublicSharing,
    "site-url": SITE_URL,
  });
  const settingsState = mockSettings(settings);
  setupStatefulSettingsEndpoints(settings);
  setupSettingsEndpoints(
    Object.entries(settings).map(([key, value]) =>
      // Unjustified type cast. FIXME
      createMockSettingDefinition({ key: key as SettingKey, value }),
    ),
  );
  setupStatefulPublicLinksEndpoints("action", PUBLIC_ACTIONS);
  setupStatefulPublicLinksEndpoints("card", PUBLIC_CARDS);
  setupStatefulPublicLinksEndpoints("dashboard", PUBLIC_DASHBOARDS);
  setupListPublicDocumentsEndpoint([
    {
      name: "Test Document",
      id: 4,
      public_uuid: "3a9a7c46-ff19-4935-bfbe-4932d315732a",
    },
  ]);

  const { router } = renderWithProviders(
    <div>
      <PublicSharingSettingsPage />
      <UndoListing />
    </div>,
    {
      withRouter: true,
      storeInitialState: {
        settings: settingsState,
      },
    },
  );

  await screen.findByText("Enable Public Sharing");

  return { router };
};

const findRow = (name: string) =>
  screen.findByRole("row", { name: new RegExp(name) });

// Each list loads from its own endpoint, so wait for a row of every list.
const findAllLists = async () => {
  for (const name of [
    "Public dashboard",
    "Public question",
    "Public action",
    "Test Document",
  ]) {
    await findRow(name);
  }
};

// The switch stays disabled until the PUT and the settings refetch are done.
const waitForSettingSaved = async () => {
  await waitFor(() => {
    expect(screen.getByRole("switch")).toBeEnabled();
  });
  expect(await screen.findByText("Changes saved")).toBeInTheDocument();
};

describe("PublicSharingSettingsPage", () => {
  it("should render the PublicSharingSettingsPage with public sharing disabled", async () => {
    await setup(false);

    [
      "Shared dashboards",
      "Shared questions",
      "Shared action forms",
      "Shared documents",
      "Test Action",
      "Test Dashboard",
      "Test Question",
      "Test Document",
    ].forEach((text) => {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    });
  });

  it("should render the PublicSharingSettingsPage with public sharing enabled", async () => {
    await setup(true);

    // Each list loads from its own endpoint, so await one row per list.
    expect(await screen.findByText("Test Action")).toBeInTheDocument();
    expect(await screen.findByText("Test Dashboard")).toBeInTheDocument();
    expect(await screen.findByText("Test Question")).toBeInTheDocument();
    expect(await screen.findByText("Test Document")).toBeInTheDocument();

    [
      "Shared dashboards",
      "Shared questions",
      "Shared action forms",
      "Shared documents",
    ].forEach((text) => {
      expect(screen.getByText(text)).toBeInTheDocument();
    });
  });

  it("should toggle public sharing", async () => {
    await setup(false);
    expect(screen.queryByText("Shared dashboards")).not.toBeInTheDocument();
    expect(screen.queryByText("Shared questions")).not.toBeInTheDocument();
    expect(screen.queryByText("Shared action forms")).not.toBeInTheDocument();
    expect(screen.queryByText("Shared documents")).not.toBeInTheDocument();

    // Toggle public sharing on
    const toggle = screen.getByRole("switch");
    await userEvent.click(toggle);

    await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
      const { url: putUrl, body: putBody } = puts[0];
      expect(putUrl).toContain("/api/setting/enable-public-sharing");
      expect(putBody).toEqual({ value: true });
    });

    // Should show success toast
    await waitFor(() => {
      const toast = screen.getByLabelText("check_filled icon");
      expect(toast).toBeInTheDocument();
    });
    await waitForSettingSaved();
    await findAllLists();
  });

  it("should turn public sharing off and hide the shared lists", async () => {
    await setup(true);
    await findAllLists();
    expect(screen.getByText("Public dashboard")).toBeInTheDocument();

    const setting = screen.getByTestId("enable-public-sharing-setting");
    expect(within(setting).getByText("Enabled")).toBeInTheDocument();

    await userEvent.click(within(setting).getByLabelText("Enabled"));

    expect(await within(setting).findByText("Disabled")).toBeInTheDocument();
    await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
      expect(puts[0].url).toMatch(/\/api\/setting\/enable-public-sharing$/);
      expect(puts[0].body).toEqual({ value: false });
    });
    await waitForSettingSaved();

    await waitFor(() => {
      expect(screen.queryByText("Shared dashboards")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("Shared questions")).not.toBeInTheDocument();
    expect(screen.queryByText("Shared action forms")).not.toBeInTheDocument();
    expect(screen.queryByText("Public dashboard")).not.toBeInTheDocument();
  });

  describe.each([
    {
      section: "Shared dashboards",
      model: "dashboard",
      name: "Public dashboard",
      otherName: "Test Dashboard",
      url: "/dashboard/33-public-dashboard",
      publicUrl: `${SITE_URL}/public/dashboard/${PUBLIC_DASHBOARDS[1].public_uuid}`,
      deleteUrl: "/api/dashboard/33/public_link",
      emptyMessage: "No dashboards have been publicly shared yet.",
    },
    {
      section: "Shared questions",
      model: "card",
      name: "Public question",
      otherName: "Test Question",
      url: "/question/22-public-question",
      publicUrl: `${SITE_URL}/public/question/${PUBLIC_CARDS[1].public_uuid}`,
      deleteUrl: "/api/card/22/public_link",
      emptyMessage: "No questions have been publicly shared yet.",
    },
    {
      section: "Shared action forms",
      model: "action",
      name: "Public action",
      otherName: "Test Action",
      url: "/model/7/detail/actions/12",
      publicUrl: `${SITE_URL}/public/action/${PUBLIC_ACTIONS[1].public_uuid}`,
      deleteUrl: "/api/action/12/public_link",
      emptyMessage: "No actions have been publicly shared yet.",
    },
  ])(
    "$section",
    ({ model, name, otherName, url, publicUrl, deleteUrl, emptyMessage }) => {
      it("should link the item to its page and to its public page", async () => {
        const { router } = await setup(true);

        const row = await findRow(name);
        const publicLink = within(row).getByRole("link", { name: publicUrl });
        expect(publicLink).toHaveAttribute("href", publicUrl);

        const link = within(row).getByRole("link", { name });
        expect(link).toHaveAttribute("href", url);

        await userEvent.click(link);
        expect(router?.location.pathname).toBe(url);
      });

      it("should revoke public links after confirmation and refresh the list", async () => {
        await setup(true);

        await userEvent.click(
          within(await findRow(name)).getByRole("button", {
            name: "Revoke link",
          }),
        );
        const modal = await screen.findByRole("dialog");
        expect(
          within(modal).getByText("Disable this link?"),
        ).toBeInTheDocument();
        await userEvent.click(
          within(modal).getByRole("button", { name: "Yes" }),
        );

        await waitFor(() => {
          expect(screen.queryByText(name)).not.toBeInTheDocument();
        });
        expect(screen.getByText(otherName)).toBeInTheDocument();
        const deletes = fetchMock.callHistory.calls(
          `delete-public-${model}-link`,
        );
        expect(deletes).toHaveLength(1);
        expect(new URL(deletes[0].url).pathname).toBe(deleteUrl);

        await userEvent.click(
          within(await findRow(otherName)).getByRole("button", {
            name: "Revoke link",
          }),
        );
        await userEvent.click(
          within(await screen.findByRole("dialog")).getByRole("button", {
            name: "Yes",
          }),
        );

        expect(await screen.findByText(emptyMessage)).toBeInTheDocument();
      });
    },
  );
});
