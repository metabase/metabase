import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DottedBackground } from "metabase/common/components/upsells/components/DottedBackground";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useSelector } from "metabase/redux/hooks";
import { getIsHosted } from "metabase/selectors/settings";
import { getStoreUsers } from "metabase/selectors/store-users";
import { getUserIsAdmin } from "metabase/selectors/user";
import { TransformHeader } from "metabase/transforms/components/TransformHeader";
import { useTransformWithPolling } from "metabase/transforms/hooks/use-transform-with-polling";
import { Card, Center, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import { reload } from "metabase/utils/dom";

import { PythonTransformsUpsell } from "./PythonTransformsUpsellModal";

type TransformInspectorUpsellPageProps = {
  params: { transformId: string };
};

export function TransformInspectorUpsellPage({
  params,
}: TransformInspectorUpsellPageProps) {
  const transformId = Urls.extractEntityId(params.transformId);
  const { transform, isLoading, error } = useTransformWithPolling(transformId);
  const isHosted = useSelector(getIsHosted);
  const { isStoreUser } = useSelector(getStoreUsers);
  const isAdmin = useSelector(getUserIsAdmin);
  const shouldShowLeftColumn = (isStoreUser || isAdmin) && isHosted;

  if (isLoading || error || !transform) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <DottedBackground>
      <PageContainer>
        <TransformHeader transform={transform} />
        <Stack align="center" py="lg">
          <Card p={0} withBorder maw="48rem" w="100%">
            <PythonTransformsUpsell
              shouldShowLeftColumn={shouldShowLeftColumn}
              onSuccess={reload}
            />
          </Card>
        </Stack>
      </PageContainer>
    </DottedBackground>
  );
}
