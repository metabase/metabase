import { render, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useId } from "react";

import { EnsureSingleInstance } from "./EnsureSingleInstance";

const setup = () => {
  const warningMessage = "Only one instance allowed!";
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

  return { warningMessage, warnSpy };
};

describe("EnsureSingleInstance", () => {
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
      const instanceId = useId();

      return (
        <EnsureSingleInstance
          groupId={groupId}
          instanceId={instanceId}
          multipleRegisteredInstancesWarningMessage={multipleWarning}
        >
          {children}
        </EnsureSingleInstance>
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
      const instanceId1 = useId();
      const instanceId2 = useId();
      const instanceId3 = useId();

      return (
        <>
          <EnsureSingleInstance
            groupId={groupId}
            instanceId={instanceId1}
            multipleRegisteredInstancesWarningMessage={warningMessage}
          >
            <div>First</div>
          </EnsureSingleInstance>
          <EnsureSingleInstance
            groupId={groupId}
            instanceId={instanceId2}
            multipleRegisteredInstancesWarningMessage={warningMessage}
          >
            <div>Second</div>
          </EnsureSingleInstance>
          <EnsureSingleInstance
            groupId={groupId}
            instanceId={instanceId3}
            multipleRegisteredInstancesWarningMessage={warningMessage}
          >
            <div>Third</div>
          </EnsureSingleInstance>
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
      const groupOneInstanceId = useId();
      const groupTwoInstanceId = useId();

      return (
        <>
          <EnsureSingleInstance groupId="one" instanceId={groupOneInstanceId}>
            <div>ChildOne</div>
          </EnsureSingleInstance>
          <EnsureSingleInstance groupId="two" instanceId={groupTwoInstanceId}>
            <div>ChildTwo</div>
          </EnsureSingleInstance>
        </>
      );
    }

    render(<Wrapper />);

    expect(screen.getByText("ChildOne")).toBeInTheDocument();
    expect(screen.getByText("ChildTwo")).toBeInTheDocument();
    expect(warnSpy).not.toHaveBeenCalledWith(warningMessage);
  });
});
