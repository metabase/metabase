import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

export async function openTab(tabName: string) {
  await userEvent.click(
    screen.getByRole("tab", { name: new RegExp(`${tabName}$`) }),
  );
}
