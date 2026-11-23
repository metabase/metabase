import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { useGetNativeDatasetQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { CodeEditor } from "metabase/common/components/CodeEditor";
import { CopyButton } from "metabase/common/components/CopyButton";
import {
  formatNativeQuery,
  getEngineNativeType,
} from "metabase/databases/utils/engine";
import {
  ActionIcon,
  Alert,
  Box,
  Center,
  Icon,
  Loader,
  Modal,
  Tooltip,
} from "metabase/ui";
import * as Lib from "metabase-lib";

type ViewSqlButtonProps = {
  query: Lib.Query;
};

/** Shows the native query an analysis runs, to anyone who can write one. */
export const ViewSqlButton = ({ query }: ViewSqlButtonProps) => {
  const [isOpened, { open, close }] = useDisclosure(false);
  const canViewSql =
    Lib.databaseDisplayInfo(query)?.nativePermissions === "write";
  if (!canViewSql) {
    return null;
  }
  const label = t`View the SQL`;
  return (
    <>
      <Tooltip label={label}>
        <ActionIcon variant="subtle" aria-label={label} onClick={open}>
          <Icon name="sql" />
        </ActionIcon>
      </Tooltip>
      {isOpened && <SqlModal query={query} onClose={close} />}
    </>
  );
};

type SqlModalProps = {
  query: Lib.Query;
  onClose: () => void;
};

const SqlModal = ({ query, onClose }: SqlModalProps) => {
  const engine = Lib.databaseDisplayInfo(query)?.engine ?? undefined;
  const { data, error, isFetching } = useGetNativeDatasetQuery(
    Lib.toJsQuery(query),
  );
  const nativeQuery =
    data !== undefined ? formatNativeQuery(data.query) : undefined;

  return (
    <Modal title={t`SQL for this analysis`} size="xl" opened onClose={onClose}>
      {isFetching && (
        <Center>
          <Loader />
        </Center>
      )}
      {!isFetching && error !== undefined && (
        <Alert color="error" icon={<Icon name="warning" />}>
          {getErrorMessage(error)}
        </Alert>
      )}
      {!isFetching && nativeQuery !== undefined && (
        <Box pos="relative">
          <CodeEditor
            value={nativeQuery}
            language={getEngineNativeType(engine)}
            readOnly
          />
          <Box p="sm" pos="absolute" right={0} top={0}>
            <CopyButton value={nativeQuery} />
          </Box>
        </Box>
      )}
    </Modal>
  );
};
