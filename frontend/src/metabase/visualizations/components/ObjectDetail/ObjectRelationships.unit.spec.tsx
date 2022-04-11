import React from "react";
import { render, screen } from "@testing-library/react";

import { Relationships } from "./ObjectRelationships";
import testDataset from "./testDataset";
import testForeignKeys from "./testForeignKeys";

describe("Object Relationships", () => {
  it("renders empty message if no foreign keys are provided", () => {
    render(
      <Relationships
        tableForeignKeys={[]}
        tableForeignKeyReferences={{}}
        foreignKeyClicked={() => null}
      />,
    );

    screen.getByText(/No relationships found/i);
  });

  it("renders a list of relationships", () => {
    render(
      <Relationships
        tableForeignKeys={testForeignKeys}
        tableForeignKeyReferences={{
          13: { status: 1, value: 771 },
          33: { status: 1, value: 881 },
        }}
        foreignKeyClicked={() => null}
      />,
    );

    screen.getByText("771");
    screen.getByText(/Orders/i);
    screen.getByText("881");
    screen.getByText(/Reviews/i);
  });
});
