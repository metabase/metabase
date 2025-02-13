import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type React from "react";

import {
  setupUserAcknowledgementEndpoints,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { ActionIcon, Icon } from "metabase/ui";

import { IndicatorMenu } from "./IndicatorMenu";

const setup = async ({
  menuItems,
  seen = [],
}: {
  menuItems: React.ReactNode[];
  seen?: string[];
}) => {
  const { names } = setupUserKeyValueEndpoints({
    namespace: "indicator-menu",
    key: "collection-menu",
    value: seen,
  });

  renderWithProviders(
    <IndicatorMenu menuKey="collection-menu">
      <IndicatorMenu.Target>
        <ActionIcon>
          <Icon name="ellipsis" />
        </ActionIcon>
      </IndicatorMenu.Target>
      <IndicatorMenu.Dropdown>{menuItems}</IndicatorMenu.Dropdown>
    </IndicatorMenu>,
  );

  await waitFor(() => {
    expect(fetchMock.calls(names.get).length).toBeGreaterThanOrEqual(1);
  });

  return {
    indicatorMenuCalls: names,
  };
};

describe("IndicatorMenu", () => {
  it("should show an indicator when a new badge key is present in the menu", async () => {
    const { names } = setupUserAcknowledgementEndpoints({
      key: "move-to-dashboard",
      value: false,
    });
    const { indicatorMenuCalls } = await setup({
      menuItems: [
        <IndicatorMenu.ItemWithBadge
          key="one"
          userAckKey="move-to-dashboard"
          badgeLabel="Bar"
        >
          Foo
        </IndicatorMenu.ItemWithBadge>,
      ],
    });

    await waitForUserAckRequest(names.get);
    assertIndicatorShown(true);

    await userEvent.click(screen.getByRole("button", { name: /ellipsis/i }));

    expect(await screen.findByText("Foo")).toBeInTheDocument();
    expect(await screen.findByText("Bar")).toBeInTheDocument();

    // Assert that the menu updates has seen in the API
    const updateHasSeenCall = fetchMock.lastCall(indicatorMenuCalls.put);
    const payload = updateHasSeenCall && (await updateHasSeenCall[1]?.body);

    expect(JSON.parse(payload as string)).toHaveValue(["move-to-dashboard"]);

    // The indicator should go away
    assertIndicatorShown(false);
  });

  it("should not show an indicator when the only badges in the menu have already been seen", async () => {
    const { names } = setupUserAcknowledgementEndpoints({
      key: "move-to-dashboard",
      value: false,
    });
    setup({
      menuItems: [
        <IndicatorMenu.ItemWithBadge
          key="move-to-dashboard"
          userAckKey="move-to-dashboard"
          badgeLabel="Bar"
        >
          Foo
        </IndicatorMenu.ItemWithBadge>,
      ],
      seen: ["move-to-dashboard"],
    });

    await waitForUserAckRequest(names.get);
    assertIndicatorShown(false);

    await userEvent.click(screen.getByRole("button", { name: /ellipsis/i }));

    expect(await screen.findByText("Foo")).toBeInTheDocument();
    expect(await screen.findByText("Bar")).toBeInTheDocument();
  });

  it("should not show an indicator when the badge is not rendered for a menu item", async () => {
    const { names } = setupUserAcknowledgementEndpoints({
      key: "move-to-dashboard",
      value: true,
    });
    setup({
      menuItems: [
        <IndicatorMenu.ItemWithBadge
          key="move-to-dashboard"
          userAckKey="move-to-dashboard"
          badgeLabel="Bar"
        >
          Foo
        </IndicatorMenu.ItemWithBadge>,
      ],
    });

    await waitForUserAckRequest(names.get);
    assertIndicatorShown(false);

    await userEvent.click(screen.getByRole("button", { name: /ellipsis/i }));

    expect(await screen.findByText("Foo")).toBeInTheDocument();
    expect(screen.queryByText("Bar")).not.toBeInTheDocument();
  });
});

const assertIndicatorShown = (shown: boolean) => {
  expect(screen.getByTestId("menu-indicator-root")).toHaveAttribute(
    "data-show-indicator",
    `${shown}`,
  );
};

const waitForUserAckRequest = async (name: string) => {
  await waitFor(() =>
    expect(fetchMock.calls(name).length).toBeGreaterThanOrEqual(1),
  );
};
