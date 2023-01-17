import React, { useCallback } from "react";
import { connect } from "react-redux";

import { useOnMount } from "metabase/hooks/use-on-mount";
import { useSafeAsyncFunction } from "metabase/hooks/use-safe-async-function";
import { setErrorPage } from "metabase/redux/app";
import { ActionsApi } from "metabase/services";

import { ActionForm } from "metabase/actions/components/ActionForm";

import type { WritebackAction } from "metabase-types/api";
import type { AppErrorDescriptor } from "metabase-types/store";

import {
  LoadingAndErrorWrapper,
  ContentContainer,
  FormTitle,
} from "./PublicAction.styled";

interface OwnProps {
  params: { actionId: string };
}

interface DispatchProps {
  setErrorPage: (error: AppErrorDescriptor) => void;
}

type Props = OwnProps & DispatchProps;

const mapDispatchToProps = {
  setErrorPage,
};

function PublicAction({ params, setErrorPage }: Props) {
  const [action, setAction] = React.useState<WritebackAction | null>(null);
  const fetchAction = useSafeAsyncFunction(ActionsApi.get);

  useOnMount(() => {
    async function loadAction() {
      try {
        const action = await fetchAction({ id: params.actionId });
        setAction(action);
      } catch (error) {
        setErrorPage(error as AppErrorDescriptor);
      }
    }
    loadAction();
  });

  const renderContent = useCallback(() => {
    if (!action) {
      return null;
    }
    return (
      <ContentContainer>
        <FormTitle>{action.name}</FormTitle>
        <ActionForm
          parameters={action.parameters}
          formSettings={action.visualization_settings}
        />
      </ContentContainer>
    );
  }, [action]);

  return (
    <LoadingAndErrorWrapper loading={!action}>
      {renderContent}
    </LoadingAndErrorWrapper>
  );
}

export default connect(null, mapDispatchToProps)(PublicAction);
