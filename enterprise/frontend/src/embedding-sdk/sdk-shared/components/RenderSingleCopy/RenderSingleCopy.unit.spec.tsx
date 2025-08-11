import { render, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useId, useState } from "react";

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

  it("renders its children", async () => {
    const { warningMessage, warnSpy } = setup();
    const groupId = "foo";

    function Wrapper({
      multipleWarning,
      children,
    }: {
      multipleWarning: string;
      children: ReactNode;
    }) {
      const [map, setMap] = useState<Record<string, string[]>>({});

      useSingleCopyWrapperIdsMock.mockReturnValue({
        singleCopyIdsMap: map,
        setSingleCopyIdsMap: setMap,
      });

      const instanceId = useId();

      return (
        <RenderSingleCopy
          groupId={groupId}
          instanceId={instanceId}
          multipleRegisteredInstancesWarningMessage={multipleWarning}
        >
          {children}
        </RenderSingleCopy>
      );
    }

    render(
      <Wrapper multipleWarning={warningMessage}>
        <div>FirstChild</div>
      </Wrapper>,
    );

    expect(screen.getByText("FirstChild")).toBeInTheDocument();
    expect(warnSpy).not.toHaveBeenCalledWith(warningMessage);
  });

  it("only renders the very first of the components with the same id", async () => {
    const { warningMessage, warnSpy } = setup();
    const groupId = "foo";

    function Wrapper() {
      const [map, setMap] = useState<Record<string, string[]>>({});

      useSingleCopyWrapperIdsMock.mockReturnValue({
        singleCopyIdsMap: map,
        setSingleCopyIdsMap: setMap,
      });

      const instanceId1 = useId();
      const instanceId2 = useId();
      const instanceId3 = useId();

      return (
        <>
          <RenderSingleCopy
            groupId={groupId}
            instanceId={instanceId1}
            multipleRegisteredInstancesWarningMessage={warningMessage}
          >
            <div>First</div>
          </RenderSingleCopy>
          <RenderSingleCopy
            groupId={groupId}
            instanceId={instanceId2}
            multipleRegisteredInstancesWarningMessage={warningMessage}
          >
            <div>Second</div>
          </RenderSingleCopy>
          <RenderSingleCopy
            groupId={groupId}
            instanceId={instanceId3}
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

      const groupOneInstanceId = useId();
      const groupTwoInstanceId = useId();

      return (
        <>
          <RenderSingleCopy groupId="one" instanceId={groupOneInstanceId}>
            <div>ChildOne</div>
          </RenderSingleCopy>
          <RenderSingleCopy groupId="two" instanceId={groupTwoInstanceId}>
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
