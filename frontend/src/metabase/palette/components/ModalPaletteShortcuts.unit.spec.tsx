import userEvent from "@testing-library/user-event";
import { KBarProvider } from "kbar";

import { render } from "__support__/ui";
import { Modal } from "metabase/ui";

import { PaletteShortcutProvider } from "./PaletteShortcutProvider";

it("blocks the palette until the last open modal closes", async () => {
  const onOpen = jest.fn<void, []>();
  const ui = (parentOpen: boolean, childOpen: boolean) => (
    <KBarProvider
      options={{ toggleShortcut: "Control+k", callbacks: { onOpen } }}
    >
      <PaletteShortcutProvider>
        <Modal opened={parentOpen} onClose={() => {}}>
          Parent
        </Modal>
        <Modal.Root opened={childOpen} onClose={() => {}}>
          <Modal.Content>Child</Modal.Content>
        </Modal.Root>
      </PaletteShortcutProvider>
    </KBarProvider>
  );
  const { rerender } = render(ui(true, false));
  await userEvent.keyboard("{Control>}k{/Control}");
  expect(onOpen).not.toHaveBeenCalled();

  rerender(ui(true, true));
  await userEvent.keyboard("{Control>}k{/Control}");
  expect(onOpen).not.toHaveBeenCalled();

  rerender(ui(false, true));
  await userEvent.keyboard("{Control>}k{/Control}");
  expect(onOpen).not.toHaveBeenCalled();

  rerender(ui(false, false));
  await userEvent.keyboard("{Control>}k{/Control}");
  expect(onOpen).toHaveBeenCalledTimes(1);
});
