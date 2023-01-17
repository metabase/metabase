import React, { useCallback, useState } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import { useOnMount } from "metabase/hooks/use-on-mount";
import { useSafeAsyncFunction } from "metabase/hooks/use-safe-async-function";
import { setErrorPage } from "metabase/redux/app";
import { ActionsApi } from "metabase/services";

import { ActionForm } from "metabase/actions/components/ActionForm";

import type {
  ParametersForActionExecution,
  WritebackAction,
} from "metabase-types/api";
import type { AppErrorDescriptor } from "metabase-types/store";

import EmbedFrame from "metabase/public/components/EmbedFrame";
import {
  LoadingAndErrorWrapper,
  ContentContainer,
  FormTitle,
  FormResultMessage,
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
  const [action, setAction] = useState<WritebackAction | null>(null);
  const [isSubmitted, setSubmitted] = useState(false);
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

  const handleSubmit = useCallback(
    (values: ParametersForActionExecution) => {
      try {
        setSubmitted(true);
      } catch (error) {
        setErrorPage(error as AppErrorDescriptor);
      }
    },
    [setErrorPage],
  );

  const renderContent = useCallback(() => {
    if (!action) {
      return null;
    }
    if (isSubmitted) {
      return (
        <FormResultMessage>{t`Thanks for your submission.`}</FormResultMessage>
      );
    }
    return (
      <>
        <FormTitle>{action.name}</FormTitle>
        <ActionForm
          parameters={action.parameters}
          formSettings={action.visualization_settings}
          onSubmit={handleSubmit}
        />
      </>
    );
  }, [action, isSubmitted, handleSubmit]);

  return (
    <EmbedFrame footerVariant="big">
      <LoadingAndErrorWrapper loading={!action}>
        {() => <ContentContainer>{renderContent()}</ContentContainer>}
      </LoadingAndErrorWrapper>
    </EmbedFrame>
  );
}

export default connect(null, mapDispatchToProps)(PublicAction);
