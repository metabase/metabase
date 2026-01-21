import { useCallback, useEffect } from "react";
import { useAsyncFn, useMount } from "react-use";

import { connect } from "metabase/lib/redux";
import { SyncedEmbedFrame } from "metabase/public/components/EmbedFrame";
import { setErrorPage } from "metabase/redux/app";
import { PublicApi } from "metabase/services";
import type { WritebackAction } from "metabase-types/api";

import PublicAction from "./PublicAction";
import {
  ContentContainer,
  LoadingAndErrorWrapper,
} from "./PublicAction.styled";

interface OwnProps {
  params: { uuid: string };
}

interface DispatchProps {
  setErrorPage: (error: any) => void;
}

type Props = OwnProps & DispatchProps;

const mapDispatchToProps = {
  setErrorPage,
};

function PublicActionLoader({ params, setErrorPage }: Props) {
  const [{ value: action, error }, fetchAction] = useAsyncFn(
    () => PublicApi.action({ uuid: params.uuid }) as Promise<WritebackAction>,
    [params.uuid],
  );

  useMount(() => {
    fetchAction();
  });

  useEffect(() => {
    if (error) {
      setErrorPage(error);
    }
  }, [error, setErrorPage]);

  const renderContent = useCallback(() => {
    if (!action) {
      return null;
    }
    return (
      <ContentContainer>
        <PublicAction
          action={action}
          publicId={params.uuid}
          onError={setErrorPage}
        />
      </ContentContainer>
    );
  }, [action, params.uuid, setErrorPage]);

  return (
    <SyncedEmbedFrame footerVariant="large">
      <LoadingAndErrorWrapper loading={!action}>
        {renderContent}
      </LoadingAndErrorWrapper>
    </SyncedEmbedFrame>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(null, mapDispatchToProps)(PublicActionLoader);
