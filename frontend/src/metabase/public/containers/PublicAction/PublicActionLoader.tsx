import { useCallback, useEffect } from "react";
import { useAsyncFn, useMount } from "react-use";

import { publicApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { SyncedEmbedFrame } from "metabase/public/components/EmbedFrame";
import { connect, useDispatch } from "metabase/redux";
import { setErrorPage } from "metabase/redux/app";
import { useParams } from "metabase/router";
import { Flex } from "metabase/ui";

import PublicAction from "./PublicAction";
import S from "./PublicActionLoader.module.css";

interface DispatchProps {
  setErrorPage: (error: any) => void;
}

type Props = DispatchProps;

const mapDispatchToProps = {
  setErrorPage,
};

function PublicActionLoader({ setErrorPage }: Props) {
  const { uuid = "" } = useParams<{ uuid: string }>();
  const dispatch = useDispatch();
  const [{ value: action, error }, fetchAction] = useAsyncFn(
    () =>
      runRtkEndpoint(
        { uuid: uuid },
        dispatch,
        publicApi.endpoints.getPublicAction,
      ),
    [uuid, dispatch],
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
      <Flex flex="1 0 auto" align="center" justify="center" p="xl">
        <PublicAction action={action} publicId={uuid} onError={setErrorPage} />
      </Flex>
    );
  }, [action, uuid, setErrorPage]);

  return (
    <SyncedEmbedFrame footerVariant="large">
      <LoadingAndErrorWrapper className={S.loadingWrapper} loading={!action}>
        {renderContent}
      </LoadingAndErrorWrapper>
    </SyncedEmbedFrame>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(null, mapDispatchToProps)(PublicActionLoader);
