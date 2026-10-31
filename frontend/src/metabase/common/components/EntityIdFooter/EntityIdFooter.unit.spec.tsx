import { useClipboard } from "@mantine/hooks";
import userEvent from "@testing-library/user-event";

import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, within } from "__support__/ui";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { EntityIdFooter, type EntityIdFooterItem } from "./EntityIdFooter";

jest.mock("@mantine/hooks", () => ({
  ...jest.requireActual("@mantine/hooks"),
  useClipboard: jest.fn(),
}));

const mockUseClipboard = jest.mocked(useClipboard);

const ITEMS: EntityIdFooterItem[] = [
  { label: "This dashboard", entityId: "dashboard-entity-id-00" },
  { label: "Tab 1", entityId: "tab-1-entity-id-000000" },
  { label: "Tab 2", entityId: "tab-2-entity-id-000000" },
];

type SetupOpts = {
  items?: EntityIdFooterItem[];
  hasSerialization?: boolean;
};

const setup = ({ items = ITEMS, hasSerialization = true }: SetupOpts = {}) => {
  const copy = jest.fn();
  mockUseClipboard.mockReturnValue({
    copy,
    copied: false,
    reset: jest.fn(),
    error: null,
  });

  renderWithProviders(<EntityIdFooter items={items} />, {
    storeInitialState: createMockState({
      settings: mockSettings({
        "token-features": createMockTokenFeatures({
          serialization: hasSerialization,
        }),
      }),
    }),
  });

  return { copy };
};

const getToggle = () => screen.getByRole("button", { name: "Entity ID info" });

describe("EntityIdFooter", () => {
  it("renders nothing without the serialization feature", () => {
    setup({ hasSerialization: false });

    expect(screen.queryByText("Entity ID info")).not.toBeInTheDocument();
  });

  it("starts collapsed and expands on click", async () => {
    setup();

    expect(getToggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("term")).not.toBeInTheDocument();

    await userEvent.click(getToggle());

    expect(getToggle()).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findAllByRole("term")).toHaveLength(ITEMS.length);
  });

  it("collapses again on a second click", async () => {
    setup();

    await userEvent.click(getToggle());
    await screen.findAllByRole("term");
    await userEvent.click(getToggle());

    expect(getToggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("term")).not.toBeInTheDocument();
  });

  it("lists every item with its label and entity ID", async () => {
    setup();

    await userEvent.click(getToggle());

    const labels = await screen.findAllByRole("term");
    const values = screen.getAllByRole("definition");
    expect(labels.map((label) => label.textContent)).toEqual(
      ITEMS.map((item) => item.label),
    );
    expect(values).toHaveLength(ITEMS.length);
    values.forEach((value, index) => {
      expect(
        within(value).getByText(ITEMS[index].entityId),
      ).toBeInTheDocument();
    });
  });

  it("copies an entity ID on click", async () => {
    const { copy } = setup();

    await userEvent.click(getToggle());
    await userEvent.click(
      await screen.findByRole("button", {
        name: `Copy entity ID ${ITEMS[1].entityId}`,
      }),
    );

    expect(copy).toHaveBeenCalledTimes(1);
    expect(copy).toHaveBeenCalledWith(ITEMS[1].entityId);
  });
});
