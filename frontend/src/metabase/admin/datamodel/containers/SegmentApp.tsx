import { useCallback, useState } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";

import {
  skipToken,
  useCreateSegmentMutation,
  useGetSegmentQuery,
  useGetTableQueryMetadataQuery,
  useUpdateSegmentMutation,
} from "metabase/api";
import { BenchLayout } from "metabase/bench/components/BenchLayout";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { NoDataError } from "metabase/common/components/errors/NoDataError";
import { useCallbackEffect } from "metabase/common/hooks/use-callback-effect";
import { useDispatch } from "metabase/lib/redux";
import { Box, Card, Center } from "metabase/ui";
import type {
  CreateSegmentRequest,
  UpdateSegmentRequest,
} from "metabase-types/api";

import { SegmentForm } from "../components/SegmentForm";

import SegmentListApp from "./SegmentListApp";

const SEGMENT_LIST_ROUTE = "/bench/segment";

export const UpdateSegmentForm = ({
  params,
  route,
}: {
  params: { id: string };
  route: Route;
}) => {
  const {
    data: segment,
    isLoading: isSegmentLoading,
    error,
  } = useGetSegmentQuery(Number(params.id));
  const { isLoading: isTableLoading } = useGetTableQueryMetadataQuery(
    segment ? { id: segment?.table_id } : skipToken,
  );
  const [updateSegment] = useUpdateSegmentMutation();
  const dispatch = useDispatch();

  const [isDirty, setIsDirty] = useState(false);

  const handleSubmit = async (values: Partial<UpdateSegmentRequest>) => {
    setIsDirty(false);
    await updateSegment(values as UpdateSegmentRequest).unwrap();
    dispatch(push(SEGMENT_LIST_ROUTE));
  };

  const isLoading = isSegmentLoading || isTableLoading;

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <>
      <SegmentForm
        segment={segment}
        onSubmit={handleSubmit}
        setIsDirty={setIsDirty}
      />
      <LeaveRouteConfirmModal isEnabled={isDirty} route={route} />
    </>
  );
};

export const CreateSegmentForm = ({ route }: { route: Route }) => {
  const [isDirty, setIsDirty] = useState(false);
  const [createSegment] = useCreateSegmentMutation();
  const dispatch = useDispatch();

  /**
   * Navigation is scheduled so that LeaveConfirmationModal's isEnabled
   * prop has a chance to re-compute on re-render
   */
  const [, scheduleCallback] = useCallbackEffect();

  const handleSubmit = useCallback(
    (segment: Partial<CreateSegmentRequest>) => {
      setIsDirty(false);

      scheduleCallback(async () => {
        try {
          await createSegment(segment as CreateSegmentRequest).unwrap();
          dispatch(push(SEGMENT_LIST_ROUTE));
        } catch (error) {
          setIsDirty(isDirty);
        }
      });
    },
    [isDirty, scheduleCallback, createSegment, dispatch],
  );

  return (
    <>
      <SegmentForm onSubmit={handleSubmit} setIsDirty={setIsDirty} />
      <LeaveRouteConfirmModal isEnabled={isDirty} route={route} />
    </>
  );
};

export const SegmentApp = ({
  params,
  children,
}: {
  params: { id: string };
  children?: React.ReactNode;
}) => {
  return (
    <BenchLayout nav={<SegmentListApp params={params} />} name="segment">
      {!children ? (
        <Center w="100%" h="100%">
          <NoDataError />
        </Center>
      ) : (
        <Box p="md">
          <Card>{children}</Card>
        </Box>
      )}
    </BenchLayout>
  );
};
