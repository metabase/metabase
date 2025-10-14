/* eslint-disable react/prop-types */
import cx from "classnames";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import { SegmentItem } from "metabase/admin/datamodel/components/SegmentItem";
import {
  ItemsListAddButton,
  ItemsListSection,
} from "metabase/bench/components/ItemsListSection/ItemsListSection";
import { ItemsListSettings } from "metabase/bench/components/ItemsListSection/ItemsListSettings";
import { useItemsListQuery } from "metabase/bench/components/ItemsListSection/useItemsListQuery";
import CS from "metabase/css/core/index.css";
import Segments from "metabase/entities/segments";
import { connect, useDispatch } from "metabase/lib/redux";
import { Stack } from "metabase/ui";

function SegmentListAppInner({ onCollapse, ...props }) {
  const { segments, setArchived, location, params } = props;
  const dispatch = useDispatch();

  const listSettingsProps = useItemsListQuery({
    settings: [
      {
        name: "display",
        options: [
          {
            label: t`Segment table`,
            value: "segment-table",
          },
          {
            label: t`Alphabetical`,
            value: "alphabetical",
          },
        ],
      },
    ],
    defaults: { display: "segment-table" },
    location,
  });

  return (
    <ItemsListSection
      sectionTitle={t`Segments`}
      onCollapse={onCollapse}
      addButton={
        <ItemsListAddButton
          onClick={() => dispatch(push("/bench/segment/new"))}
        />
      }
      settings={<ItemsListSettings {...listSettingsProps} />}
      listItems={
        <Stack gap="xs">
          {segments.map((segment) => (
            <SegmentItem
              key={segment.id}
              onRetire={() => setArchived(segment, true)}
              segment={segment}
              isActive={params.id && +params.id === segment.id}
            />
          ))}
          {segments.length === 0 && (
            <div
              className={cx(CS.flex, CS.layoutCentered, CS.m4, CS.textMedium)}
            >
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
  connect(null, { setArchived: Segments.actions.setArchived }),
)(SegmentListAppInner);

export default SegmentListApp;
