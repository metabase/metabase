import React from "react";
import { render, screen } from "@testing-library/react";
import DatabaseStep, { DatabaseStepProps } from "./DatabaseStep";
import { DatabaseDetails, DatabaseInfo } from "metabase-types/store";

const ComponentMock = () => <div />;

jest.mock("metabase/entities/databases", () => ({
  forms: { setup: jest.fn() },
  Form: ComponentMock,
}));

jest.mock("metabase/entities/users", () => ({
  forms: { setup_invite: jest.fn() },
  Form: ComponentMock,
}));

jest.mock("metabase/containers/DriverWarning", () => ComponentMock);

describe("DatabaseStep", () => {
  it("should render in active state", () => {
    const props = getProps({
      isStepActive: true,
      isStepCompleted: false,
    });

    render(<DatabaseStep {...props} />);

    expect(screen.getByText("Add your data"));
  });

  it("should render in completed state", () => {
    const props = getProps({
      database: getDatabaseInfo({ name: "Test" }),
      isStepActive: false,
      isStepCompleted: true,
    });

    render(<DatabaseStep {...props} />);

    expect(screen.getByText("Connecting to Test"));
  });

  it("should render a user invite form", () => {
    const props = getProps({
      isStepActive: true,
      isEmailConfigured: true,
    });

    render(<DatabaseStep {...props} />);

    expect(screen.getByText("Need help connecting to your data?"));
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

const getDatabaseInfo = (opts?: Partial<DatabaseInfo>): DatabaseInfo => ({
  name: "Database",
  engine: "postgres",
  details: getDatabaseDetails(),
  ...opts,
});

const getDatabaseDetails = (
  opts?: Partial<DatabaseDetails>,
): DatabaseDetails => ({
  ssl: false,
  ...opts,
});
