import React from "react";
import { render, screen } from "@testing-library/react";

import { Relationships } from "./ObjectRelationships";
import testForeignKeys from "__support__/testForeignKeys";

describe("Object Relationships", () => {
  it("renders null if no foreign keys are provided", () => {
    const { container } = render(
      <Relationships
        objectName="Large Sandstone Socks"
        tableForeignKeys={[]}
        tableForeignKeyReferences={{}}
        foreignKeyClicked={() => null}
      />,
    );

    expect(container.childElementCount).toEqual(0);
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

    screen.getByText(/Large Sandstone Socks/i);
    screen.getByText("771");
    screen.getByText(/Orders/i);
    screen.getByText("881");
    screen.getByText(/Reviews/i);
  });
});
