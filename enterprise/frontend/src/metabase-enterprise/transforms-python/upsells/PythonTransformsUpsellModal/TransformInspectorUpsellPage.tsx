import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DottedBackground } from "metabase/common/components/upsells/components/DottedBackground";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { getUserIsAdmin } from "metabase/current-user";
import { useSelector } from "metabase/redux/hooks";
import { useParams } from "metabase/router";
import { getStoreUsers } from "metabase/selectors/store-users";
import { useSetting } from "metabase/settings";
import { TransformHeader } from "metabase/transforms/components/TransformHeader";
import { useTransformPermissions } from "metabase/transforms/hooks/use-transform-permissions";
import { useTransformWithPolling } from "metabase/transforms/hooks/use-transform-with-polling";
import { Card, Center, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import { reload } from "metabase/utils/dom";

import { PythonTransformsUpsell } from "./PythonTransformsUpsellModal";

export function TransformInspectorUpsellPage() {
  const { transformId: transformIdParam } = useParams();
  const transformId = Urls.extractEntityId(transformIdParam);
  const { transform, isLoading, error } = useTransformWithPolling(transformId);
  const { readOnly } = useTransformPermissions({ transform });
  const isHosted = useSetting("is-hosted?");
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
        <TransformHeader transform={transform} readOnly={readOnly} />
        <Stack align="center" py="xl">
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
