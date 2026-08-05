import userEvent from "@testing-library/user-event";

import { screen, within } from "__support__/ui";
import {
  createMockGroup,
  createMockTenant,
  createMockUser,
} from "metabase-types/api/mocks";

export const BOBBY = createMockUser({
  id: 1,
  first_name: "Bobby",
  last_name: "Tables",
  common_name: "Bobby Tables",
});

export const ROBERT = createMockUser({
  id: 2,
  first_name: "Robert",
  last_name: "Tableton",
  common_name: "Robert Tableton",
});

export const ALL_USERS_GROUP = createMockGroup({ id: 1, name: "All Users" });
export const ADMIN_GROUP = createMockGroup({ id: 2, name: "Administrators" });
export const DATA_GROUP = createMockGroup({ id: 5, name: "data" });

export const BOBBY_TENANT = createMockTenant({
  id: 1,
  name: "Bobby Analytics",
  slug: "bobby-analytics",
});

export const ROBERT_TENANT = createMockTenant({
  id: 2,
  name: "Robert Analytics",
  slug: "robert-analytics",
});

export async function selectFilterOption(testId: string, optionName: string) {
  await userEvent.click(screen.getByTestId(testId));
  const dropdown = await screen.findByRole("listbox");
  await userEvent.click(
    within(dropdown).getByRole("option", { name: optionName }),
  );
}
