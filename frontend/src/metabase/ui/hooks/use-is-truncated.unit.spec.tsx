import { act, render, screen } from "@testing-library/react";

import resizeObserver from "metabase/utils/resize-observer";

import { useAreAnyTruncated } from "./use-is-truncated";

function TruncationStatus({ disabled = false }: { disabled?: boolean }) {
  const { areAnyTruncated, ref } = useAreAnyTruncated<HTMLDivElement>({
    disabled,
  });
  return (
    <>
      {["wide", "narrow"].map((key) => (
        <div
          key={key}
          ref={(element) => {
            if (element) {
              ref.current.set(key, element);
            }
          }}
        >
          {key}
        </div>
      ))}
      <output>{areAnyTruncated ? "Truncated" : "Not truncated"}</output>
    </>
  );
}

function setup() {
  const callbacks = new Map<string, () => void>();
  jest
    .spyOn(resizeObserver, "subscribe")
    .mockImplementation((target, callback) => {
      callbacks.set(target.textContent ?? "", () =>
        callback(
          {
            target,
            contentRect: target.getBoundingClientRect(),
            contentBoxSize: [],
            borderBoxSize: [],
            devicePixelContentBoxSize: [],
          },
          resizeObserver.observer,
        ),
      );
    });
  jest.spyOn(resizeObserver, "unsubscribe").mockImplementation(() => {});
  const createRange = document.createRange.bind(document);
  jest.spyOn(document, "createRange").mockImplementation(() => {
    const range = createRange();
    range.getBoundingClientRect = () => new DOMRect(0, 0, 20, 1);
    return range;
  });
  const view = render(<TruncationStatus />);
  jest
    .spyOn(screen.getByText("wide"), "getBoundingClientRect")
    .mockReturnValue(new DOMRect(0, 0, 10, 1));
  jest
    .spyOn(screen.getByText("narrow"), "getBoundingClientRect")
    .mockReturnValue(new DOMRect(0, 0, 30, 1));
  return { ...view, resize: (key: string) => callbacks.get(key)?.() };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it("debounces each element independently", () => {
  const { resize } = setup();
  act(() => {
    resize("wide");
    jest.advanceTimersByTime(100);
    resize("wide");
    resize("narrow");
    jest.advanceTimersByTime(100);
  });
  expect(screen.getByRole("status")).toHaveTextContent("Not truncated");
  act(() => jest.advanceTimersByTime(100));
  expect(screen.getByRole("status")).toHaveTextContent(/^Truncated$/);
});

it("drops pending measurements when tracking is disabled", () => {
  const { resize, rerender } = setup();
  act(() => resize("wide"));
  rerender(<TruncationStatus disabled />);
  act(() => jest.advanceTimersByTime(200));
  expect(screen.getByRole("status")).toHaveTextContent("Not truncated");
});
