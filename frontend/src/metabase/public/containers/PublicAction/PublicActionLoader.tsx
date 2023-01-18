import React, { useCallback, useState } from "react";
import { connect } from "react-redux";

import { useOnMount } from "metabase/hooks/use-on-mount";
import { useSafeAsyncFunction } from "metabase/hooks/use-safe-async-function";
import { setErrorPage } from "metabase/redux/app";
import { ActionsApi } from "metabase/services";

import type { WritebackAction } from "metabase-types/api";
import type { AppErrorDescriptor } from "metabase-types/store";

import EmbedFrame from "../../components/EmbedFrame";
import PublicAction from "./PublicAction";
import {
  LoadingAndErrorWrapper,
  ContentContainer,
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

function PublicActionLoader({ params, setErrorPage }: Props) {
  const [action, setAction] = useState<WritebackAction | null>(null);
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
        <PublicAction action={action} onError={setErrorPage} />
      </ContentContainer>
    );
  }, [action, setErrorPage]);

  return (
    <EmbedFrame footerVariant="big">
      <LoadingAndErrorWrapper loading={!action}>
        {renderContent}
      </LoadingAndErrorWrapper>
    </EmbedFrame>
  );
}

export default connect(null, mapDispatchToProps)(PublicActionLoader);
