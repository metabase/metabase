import { t } from "ttag";

import * as Lib from "metabase-lib";

import { getTableMetadata } from "../base-query";
import type { UsersTableLink } from "../columns";
import { findColumn } from "../find-column";

import { readSegmentDefinition } from "./to-event-definition";
import type { AllocatedPeopleSegment, PeopleSegmentRef } from "./types";

const STAGE = -1;

/** Who's in the segment, as a condition on the users table. */
const getMembershipCondition = (
  metadataProvider: Lib.MetadataProvider,
  query: Lib.Query,
  { label, definition }: PeopleSegmentRef,
): Lib.Filterable => {
  switch (definition.type) {
    case "saved": {
      const metadata = Lib.segmentMetadata(query, definition.segmentId);
      if (metadata === null) {
        throw new Error(t`The segment “${label}” can't be found.`);
      }
      return metadata;
    }
    case "draft": {
      const draftQuery = readSegmentDefinition(
        metadataProvider,
        definition.query,
      );
      const [first, ...rest] =
        draftQuery !== undefined ? Lib.filters(draftQuery, STAGE) : [];
      if (first === undefined) {
        throw new Error(t`The conditions for “${label}” can't be read.`);
      }
      return rest.length === 0
        ? first
        : Lib.expressionClause("and", [first, ...rest]);
    }
  }
};

/**
 * A query on the users table: its key, and a 0/1 column per segment, named
 * by the segment's flag. Saved segments stay segment clauses, which the query
 * processor expands, so the SQL follows edits to them.
 */
export const buildPeopleSegmentsQuery = (
  metadataProvider: Lib.MetadataProvider,
  usersTable: UsersTableLink,
  segments: readonly AllocatedPeopleSegment[],
): Lib.Query => {
  let query = Lib.queryFromTableOrCardMetadata(
    metadataProvider,
    getTableMetadata(metadataProvider, usersTable.tableId),
  );
  for (const { flag, segment } of segments) {
    const condition = getMembershipCondition(metadataProvider, query, segment);
    query = Lib.expression(
      query,
      STAGE,
      flag,
      Lib.expressionClause("case", [condition, 1, 0]),
    );
  }
  return Lib.withFields(query, STAGE, [
    findColumn(query, usersTable.primaryKey),
    ...segments.map(({ flag }) => findColumn(query, flag)),
  ]);
};
