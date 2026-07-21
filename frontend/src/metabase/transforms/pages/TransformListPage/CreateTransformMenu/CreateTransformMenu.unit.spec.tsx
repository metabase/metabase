import userEvent from "@testing-library/user-event";

import { setupDatabaseListEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import {
  useMetabotAgent,
  useMetabotName,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";

import { trackTransformCreate } from "../../../analytics";

import { CreateTransformMenu } from "./CreateTransformMenu";

const mockSetPrompt = jest.fn();
const mockSetVisible = jest.fn();

jest.mock("../../../analytics", () => ({
  ...jest.requireActual("../../../analytics"),
  trackTransformCreate: jest.fn(),
}));

jest.mock("metabase/metabot/hooks", () => ({
  ...jest.requireActual("metabase/metabot/hooks"),
  useMetabotAgent: jest.fn(),
  useMetabotName: jest.fn(),
  useUserMetabotPermissions: jest.fn(),
}));

function setup({
  hasMetabotAccess = true,
}: { hasMetabotAccess?: boolean } = {}) {
  setupDatabaseListEndpoint([]);

  jest.mocked(useMetabotName).mockReturnValue("Metabot");
  // The menu only reads `hasMetabotAccess`; casting avoids stubbing every permission flag.
  jest.mocked(useUserMetabotPermissions).mockReturnValue({
    hasMetabotAccess,
  } as ReturnType<typeof useUserMetabotPermissions>);
  // The menu only calls these three members of the agent hook.
  jest.mocked(useMetabotAgent).mockReturnValue({
    setPrompt: mockSetPrompt,
    setVisible: mockSetVisible,
  } as unknown as ReturnType<typeof useMetabotAgent>);

  return renderWithProviders(<CreateTransformMenu />);
}

async function openMenu() {
  await userEvent.click(
    screen.getByRole("button", { name: "Create a transform" }),
  );
}

describe("CreateTransformMenu", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows the Metabot item as the first option when the user has Metabot access", async () => {
    setup({ hasMetabotAccess: true });
    await openMenu();

    const items = await screen.findAllByRole("menuitem");
    expect(items[0]).toHaveTextContent("Metabot");
  });

  it("hides the Metabot item when the user lacks Metabot access", async () => {
    setup({ hasMetabotAccess: false });
    await openMenu();

    expect(await screen.findByText("SQL query")).toBeInTheDocument();
    expect(screen.queryByText("Metabot")).not.toBeInTheDocument();
  });

  it("opens Metabot with a pre-seeded prompt when the Metabot item is clicked", async () => {
    setup({ hasMetabotAccess: true });
    await openMenu();

    await userEvent.click(await screen.findByText("Metabot"));

    expect(trackTransformCreate).toHaveBeenCalledWith({
      creationType: "metabot",
    });
    expect(mockSetPrompt).toHaveBeenCalledWith("Create a transform that ");
    expect(mockSetVisible).toHaveBeenCalledWith(true);
  });
});
