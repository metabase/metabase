import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ObjectDetailWrapper } from "metabase/visualizations/components/ObjectDetail/ObjectDetailWrapper";
import { ObjectDetailProps } from "metabase/visualizations/components/ObjectDetail/types";
import { testDataset } from "__support__/testDataset";

function setup(options?: Partial<ObjectDetailProps>) {
  render(
    <ObjectDetailWrapper
      data={testDataset as any}
      question={
        {
          displayName: () => "Product",
          database: () => ({
            getPlainObject: () => ({}),
          }),
        } as any
      }
      table={
        {
          objectName: () => "Product",
        } as any
      }
      zoomedRow={testDataset.rows[0]}
      zoomedRowID={0}
      tableForeignKeys={[]}
      tableForeignKeyReferences={[]}
      settings={{
        column: () => null,
      }}
      showHeader
      canZoom={true}
      canZoomPreviousRow={false}
      canZoomNextRow={false}
      followForeignKey={() => null}
      onVisualizationClick={() => null}
      visualizationIsClickable={() => false}
      fetchTableFks={() => null}
      loadObjectDetailFKReferences={() => null}
      viewPreviousObjectDetail={() => null}
      viewNextObjectDetail={() => null}
      closeObjectDetail={() => null}
      {...options}
    />,
  );
}

describe("Object Detail Wrapper", () => {
  it("renders an object detail with a paginator", () => {
    setup();

    expect(screen.getByText(/Item 1 of 10/i)).toBeInTheDocument();
  });

  it("shows object detail header", () => {
    setup({
      settings: {
        "detail.showHeader": true,
      },
      showHeader: false,
    });

    expect(screen.getByText(/Product/i)).toBeInTheDocument();
  });

  it("hides object detail header", () => {
    setup({
      settings: {
        "detail.showHeader": false,
      },
      showHeader: false,
    });

    expect(screen.queryByText(/Product/i)).not.toBeInTheDocument();
  });

  it("traps focus in the object detail modal when opened", async () => {
    setup({
      isObjectDetail: true,
    });

    await screen.findByTestId("object-detail");

    // first tab should focus on the close button, since there's only
    // one element to show here.
    userEvent.tab();
    expect(screen.getByTestId("object-detail-close-button")).toHaveFocus();

    // second tab should *keep* focus on the close button, not go
    // to the body
    userEvent.tab();
    expect(screen.getByTestId("object-detail-close-button")).toHaveFocus();
  });
});
