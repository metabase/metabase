import { useCallback } from "react";
import type { Route } from "react-router";

import {
  skipToken,
  useCreateSegmentMutation,
  useGetSegmentQuery,
  useGetTableQueryMetadataQuery,
  useUpdateSegmentMutation,
} from "metabase/api";
import { BenchLayout } from "metabase/bench/components/BenchLayout";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { NoDataError } from "metabase/common/components/errors/NoDataError";
import { Box, Card, Center } from "metabase/ui";
import type {
  CreateSegmentRequest,
  UpdateSegmentRequest,
} from "metabase-types/api";

import { SegmentForm } from "../components/SegmentForm";

import SegmentListApp from "./SegmentListApp";

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

  const handleSubmit = useCallback(
    async (values: Partial<UpdateSegmentRequest>) => {
      return updateSegment(values as UpdateSegmentRequest).unwrap();
    },
    [updateSegment],
  );

  const isLoading = isSegmentLoading || isTableLoading;

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <SegmentForm segment={segment} onSubmit={handleSubmit} route={route} />
  );
};

export const CreateSegmentForm = ({ route }: { route: Route }) => {
  const [createSegment] = useCreateSegmentMutation();

  const handleSubmit = useCallback(
    async (segment: Partial<CreateSegmentRequest>) => {
      return createSegment(segment as CreateSegmentRequest).unwrap();
    },
    [createSegment],
  );

  return <SegmentForm onSubmit={handleSubmit} route={route} />;
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
