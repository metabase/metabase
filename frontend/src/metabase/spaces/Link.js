import React from "react";
import { Link as ReactRouterLink } from "react-router";

const links = {
  Home:               "/_spaces/",
  Profile:            "/_spaces/profile",
  New:                "/_spaces/new",
  NewCollection:      "/_spaces/collection/new",
  Data:               "/_spaces/data",
  DB:                 "/_spaces/data/db/:id",
  SQL:                "/_spaces/data/db/:id/:sql",
  Table:              "/_spaces/data/table/:id",
  QB:                 "/_spaces/data/table/:id/:qb",
  Metadata:           "/_spaces/data/table/:id/m/metadata",
  TScalar:            "/_spaces/data/table/:id/e/:scalar",
  TTime:              "/_spaces/data/table/:id/t/:time",
  Space:              "/_spaces/:space",
  Guide:              "/_spaces/:space/guide",
  Questions:          "/_spaces/:space/questions",
  Shared:             "/_spaces/:space/shared",
  Dashboard:          "/_spaces/:space/dashboard/:id",
  Metrics:            "/_spaces/:space/metrics",
  Metric:             "/_spaces/:space/metric/:id",
  MQB:                "/_spaces/:space/metric/:id/:qb",
  MFiltered:          "/_spaces/:space/metric/:id/f/:segmentId",
  Segments:           "/_spaces/:space/segments",
  Segment:            "/_spaces/:space/segment/:id",
  SegmentQB:          "/_spaces/:space/segment/:id/:qb",
  Question:           "/_spaces/:space/question/:id",
  QQB:                "/_spaces/:space/question/:id/:qb",
  QEdit:              "/_spaces/:space/question/:id/e/:edit",
  Publish:            "/_spaces/:space/question/:id/p/publish",
  MetricPublish:      "/_spaces/:space/question/:id/p/publish/metric",
  MetricDescription:  "/_spaces/:space/question/:id/p/publish/metric/details",
  SegmentPublish:     "/_spaces/:space/question/:id/p/publish/segment",
}

export function getLink(to, params = {}) {
  if (links[to]) {
    return links[to].replace(/:(\w+)/g, (_, paramName) => params[paramName]);
  } else {
    return to;
  }
}

export const Link = ({ to, params, ...props }) =>
  <ReactRouterLink to={getLink(to, params)} {...props} />
