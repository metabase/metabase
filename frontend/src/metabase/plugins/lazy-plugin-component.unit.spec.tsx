import { Suspense } from "react";

import { render, screen } from "__support__/ui";

import { lazyPluginComponent, lazyPluginSlot } from "./lazy-plugin-component";

type SlotProps = { label: string; children?: React.ReactNode };

function Slot({ label, children }: SlotProps) {
  return (
    <div>
      <span>{label}</span>
      {children}
    </div>
  );
}

describe("lazyPluginComponent", () => {
  it("renders the component once it has loaded", async () => {
    const LazySlot = lazyPluginComponent(async () => Slot);

    render(<LazySlot label="loaded" />);

    expect(await screen.findByText("loaded")).toBeInTheDocument();
  });

  it("passes children through", async () => {
    const LazySlot = lazyPluginComponent(async () => Slot);

    render(
      <LazySlot label="wrapper">
        <span>inside</span>
      </LazySlot>,
    );

    expect(await screen.findByText("inside")).toBeInTheDocument();
  });

  // The default, and the right one for the small inline slots that make up most
  // of the registry: nothing at all until the component is there.
  it("renders nothing while loading by default", () => {
    const LazySlot = lazyPluginComponent(async () => Slot);

    render(<LazySlot label="loaded" />);

    expect(screen.queryByText("loaded")).not.toBeInTheDocument();
  });

  it("shows a fallback while loading when given one", async () => {
    const LazySlot = lazyPluginComponent(
      async () => Slot,
      <span>waiting</span>,
    );

    render(<LazySlot label="loaded" />);

    expect(screen.getByText("waiting")).toBeInTheDocument();
    expect(await screen.findByText("loaded")).toBeInTheDocument();
    expect(screen.queryByText("waiting")).not.toBeInTheDocument();
  });

  // Nothing loads until something renders the slot, which is the whole point.
  it("does not load until it is rendered", async () => {
    const load = jest.fn(async () => Slot);
    const LazySlot = lazyPluginComponent(load);

    expect(load).not.toHaveBeenCalled();

    render(<LazySlot label="loaded" />);
    expect(await screen.findByText("loaded")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("lazyPluginSlot", () => {
  // The point of it: with no boundary of its own, the suspension reaches the
  // one above, so a `modalRoute` keeps its modal closed rather than opening on
  // an empty box.
  it("suspends to the boundary above it", async () => {
    function LoadedSlot() {
      return <div>slot</div>;
    }
    const Slot = lazyPluginSlot(async () => LoadedSlot);

    render(
      <Suspense fallback={<div>outer fallback</div>}>
        <div>
          <span>chrome</span>
          <Slot />
        </div>
      </Suspense>,
    );

    expect(screen.getByText("outer fallback")).toBeInTheDocument();
    expect(screen.queryByText("chrome")).not.toBeInTheDocument();

    expect(await screen.findByText("slot")).toBeInTheDocument();
    expect(screen.getByText("chrome")).toBeInTheDocument();
  });
});
