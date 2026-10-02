import { useCallback, useState } from "react";

import ActionForm from "metabase/actions/components/ActionForm";
import { getSuccessMessage } from "metabase/actions/utils";
import { publicApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { useDispatch } from "metabase/redux";
import type { AppErrorDescriptor } from "metabase/redux/store";
import { Box, Flex } from "metabase/ui";
import type {
  ParametersForActionExecution,
  WritebackAction,
} from "metabase-types/api";

interface Props {
  action: WritebackAction;
  publicId: string;
  onError: (error: AppErrorDescriptor) => void;
}

function PublicAction({ action, publicId, onError }: Props) {
  const dispatch = useDispatch();
  const [isSubmitted, setSubmitted] = useState(false);
  const successMessage = getSuccessMessage(action);

  usePageTitle(action.name);

  const handleSubmit = useCallback(
    async (parameters: ParametersForActionExecution) => {
      try {
        await runRtkEndpoint(
          { uuid: publicId, parameters },
          dispatch,
          publicApi.endpoints.executePublicAction,
        );
        setSubmitted(true);
      } catch (error) {
        // Unjustified type cast. FIXME
        onError(error as AppErrorDescriptor);
      }
    },
    [publicId, onError, dispatch],
  );

  if (isSubmitted) {
    return (
      <Box
        component="h1"
        fw={700}
        fz="lg"
        lh="1.375rem"
        c="text-primary"
        ta="center"
      >
        {successMessage}
      </Box>
    );
  }

  return (
    <Flex
      direction="column"
      w={{ base: "100%", sm: "26.875rem" }}
      px={{ base: "sm", sm: 0 }}
    >
      <Box
        component="h1"
        fw={700}
        fz="lg"
        lh="1.375rem"
        c="text-primary"
        mb="1.3125rem"
      >
        {action.name}
      </Box>
      <ActionForm
        action={action}
        submitButtonFullWidth
        onSubmit={handleSubmit}
      />
    </Flex>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default PublicAction;
