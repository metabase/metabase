import { render, screen } from "__support__/ui";

import { useContainerWidth } from "./use-container-width";

const CONTAINER_WIDTH_PX = 640;

function WidthProbe() {
  const { ref, width } = useContainerWidth<HTMLDivElement>();
  return <div ref={ref}>{`width: ${width}`}</div>;
}

describe("useContainerWidth", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("has the element's width on the first paint", () => {
    jest
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue(new DOMRect(0, 0, CONTAINER_WIDTH_PX, 100));

    render(<WidthProbe />);

    expect(
      screen.getByText(`width: ${CONTAINER_WIDTH_PX}`),
    ).toBeInTheDocument();
  });
});
