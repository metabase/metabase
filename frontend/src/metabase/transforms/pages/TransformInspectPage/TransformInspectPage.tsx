import type { Location } from "history";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import * as Urls from "metabase/lib/urls";
import { useTransformWithPolling } from "metabase/transforms/hooks/use-transform-with-polling";
import { Alert, Center, Icon, Text } from "metabase/ui";

import { TransformHeader } from "../../components/TransformHeader";
import { RunSection } from "../TransformRunPage/RunSection";

import { InspectorContent } from "./components/InspectorContent";

type TransformInspectPageProps = {
  params: { transformId: string };
  location: Location;
};

export const TransformInspectPage = ({
  params,
  location,
}: TransformInspectPageProps) => {
  const transformId = Urls.extractEntityId(params.transformId);

  const { transform, isLoading, error } = useTransformWithPolling(transformId);

  if (isLoading || error || !transform) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="transform-inspect-content">
      <TransformHeader transform={transform} />
      {transform.last_run?.status !== "succeeded" ? (
        <>
          <Alert color="brand" icon={<Icon name="info" />}>
            <Text>{t`To inspect the transform you need to run it first.`}</Text>
          </Alert>
          <RunSection transform={transform} noTitle={true} />
        </>
      ) : (
        <InspectorContent transform={transform} location={location} />
      )}
    </PageContainer>
  );
};
