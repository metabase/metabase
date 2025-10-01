/* eslint-disable react/prop-types */
import { useCallback, useState } from "react";
import { Panel, PanelGroup } from "react-resizable-panels";
import { push } from "react-router-redux";
import _ from "underscore";

import { ResizeHandle } from "metabase/bench/components/BenchApp";
import { BenchLayout } from "metabase/bench/components/BenchLayout";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { NoDataError } from "metabase/common/components/errors/NoDataError";
import { useCallbackEffect } from "metabase/common/hooks/use-callback-effect";
import Segments from "metabase/entities/segments";
import Tables from "metabase/entities/tables";
import { connect } from "metabase/lib/redux";
import { Box, Card, Center } from "metabase/ui";

import SegmentForm from "../components/SegmentForm";
import { updatePreviewSummary } from "../datamodel";
import { getPreviewSummary } from "../selectors";

import SegmentListApp from "./SegmentListApp";

const mapDispatchToProps = {
  updatePreviewSummary,
  createSegment: Segments.actions.create,
  updateSegment: Segments.actions.update,
  onChangeLocation: push,
};

const mapStateToProps = (state, props) => ({
  previewSummary: getPreviewSummary(state),
});

const UpdateSegmentFormInner = ({
  route,
  segment,
  updateSegment,
  onChangeLocation,
  ...props
}) => {
  const [isDirty, setIsDirty] = useState(false);

  const handleSubmit = useCallback(
    async (segment) => {
      setIsDirty(false);

      try {
        await updateSegment(segment);
        onChangeLocation("/admin/datamodel/segments");
      } catch (error) {
        setIsDirty(isDirty);
      }
    },
    [updateSegment, isDirty, onChangeLocation],
  );

  return (
    <>
      <SegmentForm
        {...props}
        segment={segment.getPlainObject()}
        onIsDirtyChange={setIsDirty}
        onSubmit={handleSubmit}
      />
      <LeaveRouteConfirmModal isEnabled={isDirty} route={route} />
    </>
  );
};

export const UpdateSegmentForm = _.compose(
  Segments.load({
    id: (_state, { params }) => parseInt(params.id),
  }),
  Tables.load({
    id: (_state, { segment }) => segment?.table_id,
    fetchType: "fetchMetadataAndForeignTables",
    requestType: "fetchMetadataDeprecated",
  }),
)(UpdateSegmentFormInner);

export const CreateSegmentForm = ({
  route,
  createSegment,
  onChangeLocation,
  ...props
}) => {
  const [isDirty, setIsDirty] = useState(false);

  /**
   * Navigation is scheduled so that LeaveConfirmationModal's isEnabled
   * prop has a chance to re-compute on re-render
   */
  const [, scheduleCallback] = useCallbackEffect();

  const handleSubmit = useCallback(
    (segment) => {
      setIsDirty(false);

      scheduleCallback(async () => {
        try {
          await createSegment(segment);
          onChangeLocation("/admin/datamodel/segments");
        } catch (error) {
          setIsDirty(isDirty);
        }
      });
    },
    [scheduleCallback, createSegment, isDirty, onChangeLocation],
  );

  return (
    <>
      <SegmentForm
        {...props}
        onIsDirtyChange={setIsDirty}
        onSubmit={handleSubmit}
      />
      <LeaveRouteConfirmModal isEnabled={isDirty} route={route} />
    </>
  );
};

const SegmentApp = (props) => {
  return (
    <BenchLayout
      nav={<SegmentListApp {...props} />}
      name="segment"
    >
      {!props.children ? (
        <Center w="100%" h="100%"><NoDataError  /></Center>
      ) : (
          <Box p="md">
            <Card>
              {props.children}
            </Card>
          </Box>
      )}
    </BenchLayout>
  )
};

export default connect(mapStateToProps, mapDispatchToProps)(SegmentApp);
