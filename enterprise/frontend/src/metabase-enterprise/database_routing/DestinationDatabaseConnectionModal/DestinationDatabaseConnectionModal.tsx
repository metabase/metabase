import { useMemo } from "react";
import type { Route } from "react-router";
import { push, replace } from "react-router-redux";
import { t } from "ttag";

import { DatabaseEditConnectionForm } from "metabase/admin/databases/components/DatabaseEditConnectionForm";
import { useGetDatabaseQuery, useUpdateDatabaseMutation } from "metabase/api";
import ExternalLink from "metabase/common/components/ExternalLink";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDocsUrl } from "metabase/common/hooks";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { addUndo } from "metabase/redux/undo";
import { Flex, Icon, Modal, Text } from "metabase/ui";
import { useCreateDestinationDatabaseMutation } from "metabase-enterprise/api";
import type { Database, DatabaseData } from "metabase-types/api";

import { paramIdToGetQuery } from "../utils";

import S from "./DestinationDatabaseConnectionModal.module.css";
import { pickPrefillFieldsFromPrimaryDb } from "./utils";

export const DestinationDatabaseConnectionModal = ({
  params: { databaseId, destinationDatabaseId },
  route,
}: {
  params: { databaseId: string; destinationDatabaseId?: string };
  route: Route;
}) => {
  const dispatch = useDispatch();

  // eslint-disable-next-line no-unconditional-metabase-links-render -- Admin settings
  const { url: docsUrl } = useDocsUrl("permissions/database-routing");

  const primaryDbReq = useGetDatabaseQuery(paramIdToGetQuery(databaseId));
  const destinationDbReq = useGetDatabaseQuery(
    paramIdToGetQuery(destinationDatabaseId),
  );
  const [createDistinationDatabase] = useCreateDestinationDatabaseMutation();
  const [updateDatabase] = useUpdateDatabaseMutation();

  const isLoading = primaryDbReq.isLoading || destinationDbReq.isLoading;
  const error = primaryDbReq.error || destinationDbReq.error;
  const isNewDatabase = destinationDatabaseId === undefined;

  const destinationDatabase = useMemo<Partial<Database> | undefined>(() => {
    const primaryDb = primaryDbReq.currentData;

    if (isNewDatabase) {
      return primaryDb ? pickPrefillFieldsFromPrimaryDb(primaryDb) : undefined;
    }

    return destinationDbReq.currentData;
  }, [isNewDatabase, primaryDbReq.currentData, destinationDbReq.currentData]);

  const addingNewDatabase = destinationDatabaseId === undefined;

  const handleCloseModal = (method = "push") => {
    const dbId = parseInt(databaseId, 10);
    if (method === "push") {
      dispatch(push(Urls.viewDatabase(dbId)));
    } else {
      dispatch(replace(Urls.viewDatabase(dbId)));
    }
  };

  const handleCreateDestinationDatabase = async (database: DatabaseData) => {
    return createDistinationDatabase({
      router_database_id: parseInt(databaseId, 10),
      destination_database: database,
    }).unwrap();
  };

  const handleSaveDatabase = async (database: DatabaseData) => {
    if (typeof database.id === "number") {
      return updateDatabase({
        ...database,
        id: database.id,
        auto_run_queries: database.auto_run_queries ?? true,
      }).unwrap();
    } else {
      return handleCreateDestinationDatabase(database);
    }
  };

  const handleOnSubmit = () => {
    dispatch(
      addUndo({
        message: addingNewDatabase
          ? t`Destination database created successfully`
          : t`Destination database updated successfully`,
      }),
    );
    handleCloseModal("replace");
  };

  usePageTitle(destinationDatabase?.name || "");

  return (
    <Modal
      title={
        addingNewDatabase
          ? t`Add destination database`
          : t`Edit destination database`
      }
      opened
      onClose={handleCloseModal}
      padding="xl"
      classNames={{
        content: S.modalRoot,
        header: S.modalHeader,
        body: S.modalBody,
      }}
    >
      <LoadingAndErrorWrapper loading={isLoading} error={error}>
        <Flex
          py="sm"
          px="md"
          mx="xl"
          my="md"
          bg="background-secondary"
          align="center"
          justify="space-between"
          bd="1px solid border"
          style={{ borderRadius: ".5rem" }}
        >
          <Text>{t`You can also add databases programmatically via the API.`}</Text>
          <ExternalLink
            key="link"
            href={docsUrl}
            style={{ display: "flex", alignItems: "center", gap: 4 }}
          >
            {t`Learn more`} <Icon name="share" aria-hidden />
          </ExternalLink>
        </Flex>

        <DatabaseEditConnectionForm
          database={destinationDatabase}
          isAttachedDWH={destinationDatabase?.is_attached_dwh ?? false}
          handleSaveDb={handleSaveDatabase}
          onSubmitted={handleOnSubmit}
          onCancel={handleCloseModal}
          route={route}
          config={{
            name: { isSlug: true },
            engine: { fieldState: "hidden" },
          }}
          autofocusFieldName="name"
          formLocation="admin"
        />
      </LoadingAndErrorWrapper>
    </Modal>
  );
};
