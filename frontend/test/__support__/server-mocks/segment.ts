import fetchMock from "fetch-mock";

import { defer } from "metabase/utils/promise";
import type { Segment, SegmentId } from "metabase-types/api";
import { createMockSegment } from "metabase-types/api/mocks";

export function setupSegmentRevisionsEndpointError(segmentId: number) {
  fetchMock.get(`path:/api/revision?entity=segment&id=${segmentId}`, {
    status: 500,
    body: "Server error",
  });
}

export function setupSegmentEndpoint(segment: Segment) {
  fetchMock.get(`path:/api/segment/${segment.id}`, segment);
}

export function setupSegmentEndpointError(segmentId: number) {
  fetchMock.get(`path:/api/segment/${segmentId}`, {
    status: 500,
    body: "Segment not found",
  });
}

export function setupSegmentsEndpoints(segments: Segment[]) {
  fetchMock.post("path:/api/segment", async (call) => {
    const metric = await fetchMock.callHistory
      .lastCall(call.url)
      ?.request?.json();
    return createMockSegment(metric);
  });
  fetchMock.get("path:/api/segment", segments);
  segments.forEach((segment) => setupSegmentEndpoint(segment));
}

export type SegmentStoreRequest = {
  method: "POST" | "PUT";
  url: string;
  body: unknown;
};

type SegmentStoreOpts = {
  /** The id the store gives a segment that POST creates. */
  createdSegmentId?: SegmentId;
};

/**
 * Serves segments from a store that only the POST and PUT handlers change,
 * the way the backend stores a write: PUT merges the name, description and
 * `archived` flag of the request into the stored segment.
 *
 * Returns the write requests in the order they arrived, and `holdNextGet`,
 * which keeps the next GET of a segment pending until the function it returns
 * is called.
 */
export function setupSegmentStoreEndpoints(
  initialSegments: Segment[],
  { createdSegmentId = 1000 }: SegmentStoreOpts = {},
) {
  const segments = new Map(initialSegments.map((s) => [s.id, s]));
  const requests: SegmentStoreRequest[] = [];
  let nextGetGate: Promise<void> | undefined;

  fetchMock.get(/\/api\/segment\/\d+$/, async (call) => {
    const gate = nextGetGate;
    nextGetGate = undefined;
    await gate;
    const segment = segments.get(getSegmentIdFromUrl(call.url));
    return segment ?? { status: 404, body: "Not found" };
  });
  fetchMock.post("path:/api/segment", (call) => {
    const body: unknown = JSON.parse(String(call.options.body));
    requests.push({ method: "POST", url: "/api/segment", body });
    const tableId = getSourceTableId(body);
    const segment = createMockSegment({
      ...pickSegmentFields(body),
      ...(tableId != null && { table_id: tableId }),
      id: createdSegmentId,
    });
    segments.set(segment.id, segment);
    return segment;
  });
  fetchMock.put(/\/api\/segment\/\d+$/, (call) => {
    const id = getSegmentIdFromUrl(call.url);
    const body: unknown = JSON.parse(String(call.options.body));
    requests.push({ method: "PUT", url: `/api/segment/${id}`, body });
    const segment = segments.get(id);
    if (!segment) {
      return { status: 404, body: "Not found" };
    }
    const updated = { ...segment, ...pickSegmentFields(body) };
    segments.set(id, updated);
    return updated;
  });

  const holdNextGet = () => {
    const gate = defer<void>();
    nextGetGate = gate.promise;
    return () => gate.resolve();
  };

  return { requests, holdNextGet };
}

function getSegmentIdFromUrl(url: string): SegmentId {
  return Number(new URL(url).pathname.split("/").pop());
}

/** The backend takes a new segment's table from its definition. */
function getSourceTableId(body: unknown): number | undefined {
  if (
    typeof body !== "object" ||
    body == null ||
    !("definition" in body) ||
    typeof body.definition !== "object" ||
    body.definition == null ||
    !("stages" in body.definition) ||
    !Array.isArray(body.definition.stages)
  ) {
    return undefined;
  }
  const [stage]: unknown[] = body.definition.stages;
  if (
    typeof stage === "object" &&
    stage != null &&
    "source-table" in stage &&
    typeof stage["source-table"] === "number"
  ) {
    return stage["source-table"];
  }
  return undefined;
}

function pickSegmentFields(body: unknown): Partial<Segment> {
  if (typeof body !== "object" || body == null) {
    return {};
  }
  const fields: Partial<Segment> = {};
  if ("name" in body && typeof body.name === "string") {
    fields.name = body.name;
  }
  if ("description" in body && typeof body.description === "string") {
    fields.description = body.description;
  }
  if ("archived" in body && typeof body.archived === "boolean") {
    fields.archived = body.archived;
  }
  return fields;
}
