import React from "react";
import { render, screen } from "@testing-library/react";
import { createMockDatabaseData } from "metabase-types/api/mocks";
import DatabaseStep, { DatabaseStepProps } from "./DatabaseStep";

const ComponentMock = () => <div />;
jest.mock("metabase/databases/containers/DatabaseForm", () => ComponentMock);

describe("DatabaseStep", () => {
  it("should render in active state", () => {
    const props = getProps({
      isStepActive: true,
      isStepCompleted: false,
    });

    render(<DatabaseStep {...props} />);

    expect(screen.getByText("Add your data")).toBeInTheDocument();
  });

  it("should render in completed state", () => {
    const props = getProps({
      database: createMockDatabaseData({ name: "Test" }),
      isStepActive: false,
      isStepCompleted: true,
    });

    render(<DatabaseStep {...props} />);

    expect(screen.getByText("Connecting to Test")).toBeInTheDocument();
  });

  it("should render a user invite form", () => {
    const props = getProps({
      isStepActive: true,
      isEmailConfigured: true,
    });

    render(<DatabaseStep {...props} />);

    expect(
      screen.getByText("Need help connecting to your data?"),
    ).toBeInTheDocument();
  });
});

const getProps = (opts?: Partial<DatabaseStepProps>): DatabaseStepProps => ({
  isEmailConfigured: false,
  isStepActive: false,
  isStepCompleted: false,
  isSetupCompleted: false,
  onEngineChange: jest.fn(),
  onStepSelect: jest.fn(),
  onDatabaseSubmit: jest.fn(),
  onInviteSubmit: jest.fn(),
  onStepCancel: jest.fn(),
  ...opts,
});
