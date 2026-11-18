import userEvent from "@testing-library/user-event";
import { useKBar } from "kbar";
import { useState } from "react";

import { renderWithProviders, screen } from "__support__/ui";
import { Modal } from "metabase/ui";

const PaletteState = () => {
  const { disabled } = useKBar((state) => ({ disabled: state.disabled }));
  return <div>{disabled ? "palette disabled" : "palette enabled"}</div>;
};

const NestedModals = () => {
  const [outerOpened, setOuterOpened] = useState(false);
  const [innerOpened, setInnerOpened] = useState(false);

  return (
    <>
      <PaletteState />
      <button onClick={() => setOuterOpened(true)}>Open outer</button>
      <Modal opened={outerOpened} onClose={() => setOuterOpened(false)}>
        <button onClick={() => setInnerOpened(true)}>Open inner</button>
        <button onClick={() => setOuterOpened(false)}>Close outer</button>
        <Modal opened={innerOpened} onClose={() => setInnerOpened(false)}>
          <button onClick={() => setInnerOpened(false)}>Close inner</button>
        </Modal>
      </Modal>
    </>
  );
};

describe("AppKBarProvider", () => {
  it("disables the command palette while a modal is open", async () => {
    renderWithProviders(<NestedModals />, { withKBar: true });
    expect(screen.getByText("palette enabled")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Open outer"));
    expect(await screen.findByText("palette disabled")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Close outer"));
    expect(await screen.findByText("palette enabled")).toBeInTheDocument();
  });

  it("keeps the palette disabled until the outer modal closes when modals are nested", async () => {
    renderWithProviders(<NestedModals />, { withKBar: true });

    await userEvent.click(screen.getByText("Open outer"));
    await userEvent.click(await screen.findByText("Open inner"));
    await userEvent.click(await screen.findByText("Close inner"));
    expect(screen.getByText("palette disabled")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Close outer"));
    expect(await screen.findByText("palette enabled")).toBeInTheDocument();
  });

  it("renders a modal when there is no KBarProvider", async () => {
    renderWithProviders(
      <Modal opened onClose={jest.fn()}>
        Body
      </Modal>,
    );
    expect(await screen.findByText("Body")).toBeInTheDocument();
  });
});
