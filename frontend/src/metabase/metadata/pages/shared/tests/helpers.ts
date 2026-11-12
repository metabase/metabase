import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { act, screen, waitFor, within } from "__support__/ui";

export async function findToast(message: string) {
  return await waitFor(() => {
    const toast = screen
      .getAllByTestId("toast-undo")
      .find((toast) => toast.textContent?.includes(message));
    if (!toast) {
      throw new Error(`Cannot find toast "${message}"`);
    }
    return toast;
  });
}

export async function dismissToasts() {
  for (const toast of screen.queryAllByTestId("toast-undo")) {
    await userEvent.click(within(toast).getByLabelText("close icon"));
  }
  await waitFor(() =>
    expect(screen.queryByTestId("toast-undo")).not.toBeInTheDocument(),
  );
}

/**
 * Clicks Undo in the toast of a change, then waits for "Change undone".
 *
 * It first lets the refetch that the change started finish: a refetch that
 * answers after the undo overwrites the restored value (see the PR findings).
 */
export async function undo(message: string) {
  const toast = await findToast(message);
  await flushRequests();
  await userEvent.click(within(toast).getByRole("button", { name: "Undo" }));
  await findToast("Change undone");
  await dismissToasts();
}

export async function typeAndBlur(input: HTMLElement, text: string) {
  await userEvent.type(input, text);
  await userEvent.tab();
}

export async function findShownListbox() {
  return await waitFor(() => {
    const [listbox] = screen
      .queryAllByRole("listbox")
      .filter((listbox) => !listbox.closest('[data-hidden="true"]'));
    if (!listbox) {
      throw new Error("Cannot find an open listbox");
    }
    return listbox;
  });
}

/** Some options stay disabled until the data they depend on loads. */
export async function selectOption(input: HTMLElement, name: string) {
  await userEvent.click(input);
  const listbox = await findShownListbox();
  const option = await waitFor(() => {
    const option = within(listbox).getByText(name).closest('[role="option"]');
    if (!option || option.hasAttribute("data-combobox-disabled")) {
      throw new Error(`Cannot find the enabled option "${name}"`);
    }
    return option;
  });
  await userEvent.click(option);
}

/** Lets the requests a test started finish, so they cannot leak into the next test. */
export async function flushRequests() {
  await act(() => fetchMock.callHistory.flush(true));
}
