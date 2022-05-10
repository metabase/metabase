import React from "react";
import { renderWithProviders, screen } from "__support__/ui";
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

function setup(props: DatabaseStepProps) {
  renderWithProviders(<DatabaseStep {...props} />, {
    reducers: {
      settings: () => ({
        values: {},
      }),
    },
  });
}

describe("DatabaseStep", () => {
  it("should render in active state", () => {
    const props = getProps({
      isStepActive: true,
      isStepCompleted: false,
    });

    setup(props);

    expect(screen.getByText("Add your data"));
  });

  it("should render in completed state", () => {
    const props = getProps({
      database: getDatabaseInfo({ name: "Test" }),
      isStepActive: false,
      isStepCompleted: true,
    });

    setup(props);

    expect(screen.getByText("Connecting to Test"));
  });

  it("should render a user invite form", () => {
    const props = getProps({
      isStepActive: true,
      isEmailConfigured: true,
    });

    setup(props);

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
