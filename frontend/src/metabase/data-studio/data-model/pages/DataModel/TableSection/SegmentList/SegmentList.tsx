import { useState } from "react";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { ForwardRefLink } from "metabase/common/components/Link";
import { trackSegmentCreateStarted } from "metabase/common/data-studio/analytics";
import { getUserCanWriteSegments } from "metabase/common/data-studio/selectors";
import { useSelector } from "metabase/redux";
import { Button, type ButtonProps, Icon, Stack, rem } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

import {
  ListSearchBar,
  ListSearchEmptyState,
  matchesListSearch,
} from "../ListSearchBar";
import S from "../TableSection.module.css";

import { SegmentItem } from "./SegmentItem";

type SegmentListProps = {
  table: Table;
};

export function SegmentList({ table }: SegmentListProps) {
  const segments = table.segments ?? [];
  const [query, setQuery] = useState("");
  const matchingSegments = segments.filter((segment) =>
    matchesListSearch(query, segment.name),
  );
  const getSegmentHref = (segmentId: number) =>
    Urls.dataStudioDataModelSegment({
      databaseId: table.db_id,
      schemaName: table.schema,
      tableId: table.id,
      segmentId,
    });
  const canCreateSegment = useSelector((state) =>
    getUserCanWriteSegments(state, table.is_published),
  );

  const renderNewSegmentButton = (variant?: ButtonProps["variant"]) =>
    canCreateSegment && (
      <Button
        variant={variant}
        component={ForwardRefLink}
        to={Urls.newDataStudioDataModelSegment({
          databaseId: table.db_id,
          schemaName: table.schema,
          tableId: table.id,
        })}
        leftSection={<Icon name="add" />}
        onClick={() =>
          trackSegmentCreateStarted("data_studio_segments", Number(table.id))
        }
      >{t`New segment`}</Button>
    );

  // The action sits under the message, centered and blue, as the next step
  if (segments.length === 0) {
    return (
      <Stack
        align="center"
        gap="lg"
        mt={80}
        className={S.EmptyState}
        data-testid="table-segments-page"
      >
        <EmptyState
          spacing="sm"
          illustrationElement={
            <Icon name="segment" size={32} c="text-secondary" />
          }
          title={t`No segments yet`}
          message={t`Create a segment to filter rows in this table.`}
        />
        {renderNewSegmentButton("filled")}
      </Stack>
    );
  }

  return (
    <Stack gap="lg" data-testid="table-segments-page">
      <ListSearchBar
        value={query}
        placeholder={t`Search segments`}
        onChange={setQuery}
      >
        {renderNewSegmentButton()}
      </ListSearchBar>

      {matchingSegments.length === 0 ? (
        <ListSearchEmptyState>{t`No segments match "${query}"`}</ListSearchEmptyState>
      ) : (
        <Stack gap={rem(12)} role="list">
          {matchingSegments.map((segment) => (
            <SegmentItem
              key={segment.id}
              segment={segment}
              href={getSegmentHref(segment.id)}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
