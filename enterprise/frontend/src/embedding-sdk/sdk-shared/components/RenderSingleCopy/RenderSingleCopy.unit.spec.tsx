import { render, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useState } from "react";

import { useSingleCopyWrapperIds } from "embedding-sdk/sdk-shared/hooks/use-single-copy-wrapper-ids";

import { RenderSingleCopy } from "./RenderSingleCopy";

jest.mock("embedding-sdk/sdk-shared/hooks/use-single-copy-wrapper-ids");

const useSingleCopyWrapperIdsMock = useSingleCopyWrapperIds as jest.Mock;

const setup = () => {
  const warningMessage = "Only one instance allowed!";
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

  return { warningMessage, warnSpy };
};

describe("RenderSingleCopy", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders its children after the mount effect", async () => {
    const { warningMessage, warnSpy } = setup();

    function Wrapper({
      identifier,
      initialMap = {},
      multipleWarning,
      children,
    }: {
      identifier: string;
      initialMap?: Record<string, string[]>;
      multipleWarning?: string;
      children: ReactNode;
    }) {
      const [map, setMap] = useState<Record<string, string[]>>(initialMap);

      useSingleCopyWrapperIdsMock.mockReturnValue({
        singleCopyIdsMap: map,
        setSingleCopyIdsMap: setMap,
      });

      return (
        <RenderSingleCopy
          identifier={identifier}
          multipleRegisteredInstancesWarningMessage={multipleWarning}
        >
          {children}
        </RenderSingleCopy>
      );
    }

    render(
      <Wrapper identifier="foo">
        <div>FirstChild</div>
      </Wrapper>,
    );

    expect(screen.getByText("FirstChild")).toBeInTheDocument();
    expect(warnSpy).not.toHaveBeenCalledWith(warningMessage);
  });

  it("only renders the very first of the components with the same id", async () => {
    const { warningMessage, warnSpy } = setup();

    function Wrapper() {
      const [map, setMap] = useState<Record<string, string[]>>({});

      useSingleCopyWrapperIdsMock.mockReturnValue({
        singleCopyIdsMap: map,
        setSingleCopyIdsMap: setMap,
      });

      return (
        <>
          <RenderSingleCopy
            identifier="foo"
            multipleRegisteredInstancesWarningMessage={warningMessage}
          >
            <div>First</div>
          </RenderSingleCopy>
          <RenderSingleCopy
            identifier="foo"
            multipleRegisteredInstancesWarningMessage={warningMessage}
          >
            <div>Second</div>
          </RenderSingleCopy>
          <RenderSingleCopy
            identifier="foo"
            multipleRegisteredInstancesWarningMessage={warningMessage}
          >
            <div>Third</div>
          </RenderSingleCopy>
        </>
      );
    }

    render(<Wrapper />);

    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.queryByText("Second")).not.toBeInTheDocument();
    expect(screen.queryByText("Third")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(warningMessage);
    });
  });

  it("renders children for two different ids independently", async () => {
    const { warningMessage, warnSpy } = setup();

    function Wrapper() {
      const [map, setMap] = useState<Record<string, string[]>>({});

      useSingleCopyWrapperIdsMock.mockReturnValue({
        singleCopyIdsMap: map,
        setSingleCopyIdsMap: setMap,
      });

      return (
        <>
          <RenderSingleCopy identifier="one">
            <div>ChildOne</div>
          </RenderSingleCopy>
          <RenderSingleCopy identifier="two">
            <div>ChildTwo</div>
          </RenderSingleCopy>
        </>
      );
    }

    render(<Wrapper />);

    expect(screen.getByText("ChildOne")).toBeInTheDocument();
    expect(screen.getByText("ChildTwo")).toBeInTheDocument();
    expect(warnSpy).not.toHaveBeenCalledWith(warningMessage);
  });
});
