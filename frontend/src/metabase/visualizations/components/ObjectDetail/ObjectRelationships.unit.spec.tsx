import React from "react";
import { render, screen } from "@testing-library/react";

import testForeignKeys from "__support__/testForeignKeys";
import { Relationships } from "./ObjectRelationships";

describe("Object Relationships", () => {
  it("renders null if no foreign keys are provided", () => {
    render(
      <div data-testid="container">
        <Relationships
          objectName="Large Sandstone Socks"
          tableForeignKeys={[]}
          tableForeignKeyReferences={{}}
          foreignKeyClicked={() => null}
        />
      </div>,
    );
    expect(screen.getByTestId("container")).toBeEmptyDOMElement();
  });

  it("renders a list of relationships", () => {
    render(
      <Relationships
        objectName="Large Sandstone Socks"
        tableForeignKeys={testForeignKeys as any[]}
        tableForeignKeyReferences={{
          13: { status: 1, value: 771 },
          33: { status: 1, value: 881 },
        }}
        foreignKeyClicked={() => null}
      />,
    );

    expect(screen.getByText(/Large Sandstone Socks/i)).toBeInTheDocument();
    expect(screen.getByText("771")).toBeInTheDocument();
    expect(screen.getByText(/Orders/i)).toBeInTheDocument();
    expect(screen.getByText("881")).toBeInTheDocument();
    expect(screen.getByText(/Reviews/i)).toBeInTheDocument();
  });
});
