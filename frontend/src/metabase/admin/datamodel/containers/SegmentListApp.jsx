/* eslint-disable react/prop-types */
import cx from "classnames";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import { SegmentItem } from "metabase/admin/datamodel/components/SegmentItem";
import FilteredToUrlTable from "metabase/admin/datamodel/hoc/FilteredToUrlTable";
import { ItemsListSection } from "metabase/bench/components/ItemsListSection/ItemsListSection";
import CS from "metabase/css/core/index.css";
import Segments from "metabase/entities/segments";
import { connect, useDispatch } from "metabase/lib/redux";
import { Box, Stack } from "metabase/ui";

function SegmentListAppInner (props) {
  const { segments, tableSelector, setArchived } = props;
  const dispatch = useDispatch();

  return (
    <ItemsListSection
      sectionTitle={t`Segments`}
      onAddNewItem={() => dispatch(push("/bench/segment/new"))}
      listItems={
        <Stack>
          {segments.map((segment) => (
            <SegmentItem
              key={segment.id}
              onRetire={() => setArchived(segment, true)}
              segment={segment}
            />
          ))}
          {segments.length === 0 && (
            <div className={cx(CS.flex, CS.layoutCentered, CS.m4, CS.textMedium)}>
              {t`Create segments to add them to the Filter dropdown in the query builder`}
            </div>
          )}
        </Stack>
      }
    />
  );

}

const SegmentListApp = _.compose(
  Segments.loadList(),
  FilteredToUrlTable("segments"),
  connect(null, { setArchived: Segments.actions.setArchived }),
)(SegmentListAppInner);

export default SegmentListApp;
