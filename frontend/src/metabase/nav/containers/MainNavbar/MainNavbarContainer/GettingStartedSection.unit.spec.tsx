import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import * as domUtils from "metabase/lib/dom";
import { createMockState } from "metabase-types/store/mocks";

import { GettingStartedSection } from "./GettingStartedSection";

const setup = ({
  hasChildren = true,
  isEmbeddingIframe,
}: {
  hasChildren?: boolean;
  isEmbeddingIframe?: boolean;
} = {}) => {
  if (isEmbeddingIframe) {
    jest.spyOn(domUtils, "isWithinIframe").mockReturnValue(true);
  }

  const onModalOpen = jest.fn();

  renderWithProviders(
    <GettingStartedSection
      nonEntityItem={{ type: "collection" }}
      onModalOpen={onModalOpen}
    >
      {hasChildren && "Child"}
    </GettingStartedSection>,
    { storeInitialState: createMockState() },
  );

  return { onModalOpen };
};

describe("GettingStartedSection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should render the section title", () => {
    setup();
    expect(screen.getByText("Getting Started")).toBeInTheDocument();
  });

  it("should render children if it has them", () => {
    setup();
    expect(screen.getByText("Getting Started")).toBeInTheDocument();
    expect(screen.getByText("Child")).toBeInTheDocument();
  });

  it("should not render children if there are none", () => {
    setup({ hasChildren: false });
    expect(screen.getByText("Getting Started")).toBeInTheDocument();
    expect(screen.queryByText("Child")).not.toBeInTheDocument();
  });

  it("should render the onboarding link", () => {
    setup();
    expect(screen.getByText("How to use Metabase")).toBeInTheDocument();
  });

  it("should not render the onboarding link within embedding iframe", () => {
    setup({ isEmbeddingIframe: true });
    expect(screen.getByText("Getting Started")).toBeInTheDocument();
    expect(screen.queryByText("How to use Metabase")).not.toBeInTheDocument();
  });

  it("should not render if empty", () => {
    setup({ hasChildren: false, isEmbeddingIframe: true });
    expect(screen.queryByText("Getting Started")).not.toBeInTheDocument();
    expect(screen.queryByText("How to use Metabase")).not.toBeInTheDocument();
  });

  it("should render the 'Add data' button", () => {
    setup();
    expect(screen.getByLabelText("Add data")).toBeInTheDocument();
  });

  it("should trigger the modal on 'Add data' click", async () => {
    const { onModalOpen } = setup();
    await userEvent.click(screen.getByText("Add data"));
    expect(onModalOpen).toHaveBeenCalledTimes(1);
  });
});
