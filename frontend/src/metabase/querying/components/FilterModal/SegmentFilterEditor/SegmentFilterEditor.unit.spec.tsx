import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { createQuery, findSegment } from "metabase-lib/test-helpers";
import { createMockSegment } from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";

import type { SegmentItem } from "../types";

import { SegmentFilterEditor } from "./SegmentFilterEditor";

const SEGMENT1 = createMockSegment({
  id: 1,
  name: "Segment 1",
  definition: {
    "source-table": ORDERS_ID,
    filter: [">", ["field", ORDERS.TOTAL, null], 0],
  },
  table_id: ORDERS_ID,
});

const SEGMENT2 = createMockSegment({
  id: 2,
  name: "Segment 2",
  definition: {
    "source-table": ORDERS_ID,
    filter: [">", ["field", ORDERS.TOTAL, null], 0],
  },
  table_id: ORDERS_ID,
});

const METADATA = createMockMetadata({
  databases: [createSampleDatabase()],
  segments: [SEGMENT1, SEGMENT2],
});

interface SetupOpts {
  segmentItems: SegmentItem[];
}

function setup({ segmentItems }: SetupOpts) {
  const onChange = jest.fn();

  renderWithProviders(
    <SegmentFilterEditor segmentItems={segmentItems} onChange={onChange} />,
  );

  const getNextSegmentItems = () => {
    const [nextSegmentItems] = onChange.mock.lastCall;
    return nextSegmentItems;
  };

  return { getNextSegmentItems };
}

describe("SegmentFilterEditor", () => {
  const defaultQuery = createQuery({ metadata: METADATA });
  const stageIndex = 0;

  it("should add a segment", async () => {
    const { getNextSegmentItems } = setup({
      segmentItems: getSegmentItems(defaultQuery, stageIndex),
    });

    await userEvent.click(screen.getByPlaceholderText("Filter segments"));
    await userEvent.click(await screen.findByText(SEGMENT2.name));

    const nextSegmentItems = getNextSegmentItems();
    expect(nextSegmentItems).toHaveLength(1);
    expect(nextSegmentItems[0].displayName).toBe(SEGMENT2.name);
  });

  it("should remove a segment", async () => {
    const query = Lib.filter(
      defaultQuery,
      stageIndex,
      findSegment(defaultQuery, SEGMENT1.name),
    );
    const { getNextSegmentItems } = setup({
      segmentItems: getSegmentItems(query, stageIndex),
    });
    expect(screen.getByText(SEGMENT1.name)).toBeInTheDocument();
    expect(screen.queryByText(SEGMENT2.name)).not.toBeInTheDocument();

    await userEvent.type(
      screen.getByLabelText("Filter segments"),
      "{backspace}",
    );
    const nextSegmentItems = getNextSegmentItems();
    expect(nextSegmentItems).toHaveLength(0);
  });
});

function getSegmentItems(query: Lib.Query, stageIndex: number): SegmentItem[] {
  const segments = Lib.availableSegments(query, stageIndex);
  return segments.map(segment => {
    const segmentInfo = Lib.displayInfo(query, stageIndex, segment);

    return {
      segment,
      stageIndex,
      displayName: segmentInfo.displayName,
      filterPositions: segmentInfo.filterPositions ?? [],
    };
  });
}
