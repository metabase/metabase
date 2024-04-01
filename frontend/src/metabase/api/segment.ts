import type { Segment, SegmentId } from "metabase-types/api";

import { Api } from "./api";
import { idTag, listTag } from "./tags";

export const segmentApi = Api.injectEndpoints({
  endpoints: builder => ({
    listSegments: builder.query<Segment[], void>({
      query: () => ({
        method: "GET",
        url: "/api/segment",
      }),
      providesTags: (segments = []) => [
        listTag("segment"),
        ...(segments.map(({ id }) => idTag("segment", id)) ?? []),
      ],
    }),
    getSegment: builder.query<Segment, SegmentId>({
      query: id => ({
        method: "GET",
        url: `/api/segment/${id}`,
      }),
      providesTags: segment => (segment ? [idTag("segment", segment.id)] : []),
    }),
  }),
});

export const { useListSegmentsQuery, useGetSegmentQuery } = segmentApi;
