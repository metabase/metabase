import { useCallback, useEffect } from "react";
import { useAsyncFn, useMount } from "react-use";

import { publicApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { SyncedEmbedFrame } from "metabase/public/components/EmbedFrame";
import { connect, useDispatch } from "metabase/redux";
import { setErrorPage } from "metabase/redux/app";

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
  const dispatch = useDispatch();
  const [{ value: action, error }, fetchAction] = useAsyncFn(
    () =>
      runRtkEndpoint(
        { uuid: params.uuid },
        dispatch,
        publicApi.endpoints.getPublicAction,
      ),
    [params.uuid, dispatch],
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
