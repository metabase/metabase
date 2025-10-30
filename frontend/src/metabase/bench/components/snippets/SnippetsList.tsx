import { useCallback, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";
import { noop } from "underscore";

import { skipToken, useListDatabasesQuery } from "metabase/api";
import {
  useCreateSnippetMutation,
  useGetSnippetQuery,
  useUpdateSnippetMutation,
} from "metabase/api/snippet";
import { getErrorMessage } from "metabase/api/utils";
import { ArchivedEntityBanner } from "metabase/archive/components/ArchivedEntityBanner";
import { BenchFlatListItem } from "metabase/bench/components/shared/BenchFlatListItem";
import { Unauthorized } from "metabase/common/components/ErrorPages/ErrorPages";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import SnippetForm, {
  type SnippetFormValues,
} from "metabase/query_builder/components/template_tags/SnippetForm/SnippetForm";
import { SnippetSidebar } from "metabase/query_builder/components/template_tags/SnippetSidebar/SnippetSidebar";
import { getHasNativeWrite } from "metabase/selectors/data";
import { getUser } from "metabase/selectors/user";
import { Box, Flex } from "metabase/ui";
import type {
  CreateSnippetRequest,
  NativeQuerySnippet,
  UpdateSnippetRequest,
} from "metabase-types/api";

import { BenchLayout } from "../BenchLayout";
import { BenchPaneHeader } from "../BenchPaneHeader";

function SnippetsList({ activeId }: { activeId?: number }) {
  const dispatch = useDispatch();
  const [snippetCollectionId, setSnippetCollectionId] = useState(null);
  const user = useSelector(getUser);

  return (
    <SnippetSidebar
      openSnippetModalWithSelectedText={() => {
        dispatch(push("/bench/snippet/new"));
      }}
      insertSnippet={noop}
      setModalSnippet={noop}
      onClose={noop}
      snippetCollectionId={snippetCollectionId}
      setSnippetCollectionId={setSnippetCollectionId}
      user={user}
      SnippetRenderer={({ item }: { item: NativeQuerySnippet }) => {
        return <SnippetListItem snippet={item} active={item.id === activeId} />;
      }}
    />
  );
}

function SnippetListItem({
  snippet,
  active,
}: {
  snippet: NativeQuerySnippet;
  active?: boolean;
}) {
  return (
    <Box mb="sm" px="lg">
      <BenchFlatListItem
        icon="snippet"
        href={`/bench/snippet/${snippet.id}`}
        label={snippet.name}
        isActive={active}
      />
    </Box>
  );
}

export const SnippetsLayout = ({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id?: string };
}) => {
  const activeId = params.id ? parseInt(params.id, 10) : undefined;
  const { data } = useListDatabasesQuery();
  const hasNativeWrite = data?.data ? getHasNativeWrite(data.data) : null;
  if (hasNativeWrite == null) {
    return null;
  }
  if (hasNativeWrite === false) {
    return (
      <BenchLayout name="snippet">
        <Unauthorized />
      </BenchLayout>
    );
  }

  return (
    <BenchLayout nav={<SnippetsList activeId={activeId} />} name="snippet">
      {children}
    </BenchLayout>
  );
};

export const SnippetEditor = ({ params }: { params: { id?: string } }) => {
  const id = params.id ? parseInt(params.id, 10) : undefined;
  return <SnippetEditorInner key={id} id={id} />;
};

export const SnippetEditorInner = ({ id }: { id?: number }) => {
  const dispatch = useDispatch();
  const { data: savedSnippet } = useGetSnippetQuery(id || skipToken, {
    refetchOnMountOrArgChange: true,
    skip: !id,
  });
  const [updateSnippet] = useUpdateSnippetMutation();
  const [createSnippet] = useCreateSnippetMutation();

  const handleCreate = useCallback(
    async (values: CreateSnippetRequest) => {
      const res = await createSnippet(values);
      if (!res.data) {
        const errorMessage = getErrorMessage(res);
        if (errorMessage) {
          throw new Error(errorMessage);
        }
        return;
      }
      dispatch(push(`/bench/snippet/${res.data.id}`));
    },
    [createSnippet, dispatch],
  );

  const handleUpdate = useCallback(
    async (values: UpdateSnippetRequest) => {
      if (!savedSnippet) {
        return;
      }
      await updateSnippet(values);
    },
    [savedSnippet, updateSnippet],
  );

  const handleArchive = useCallback(async () => {
    if (!savedSnippet) {
      return;
    }
    updateSnippet({ ...savedSnippet, archived: true });
  }, [savedSnippet, updateSnippet]);

  const {
    checkData,
    isConfirmationShown,
    handleInitialSave,
    handleSaveAfterConfirmation,
    handleCloseConfirmation,
  } = PLUGIN_DEPENDENCIES.useCheckSnippetDependencies({
    onSave: handleUpdate,
  });

  const handleSubmit = useCallback(
    async (values: SnippetFormValues) => {
      if (savedSnippet) {
        await handleInitialSave({ ...values, id: savedSnippet.id });
      } else {
        await handleCreate(values);
      }
    },
    [savedSnippet, handleCreate, handleInitialSave],
  );

  if (id && !savedSnippet) {
    return null;
  }

  return (
    <>
      <BenchPaneHeader
        title={
          savedSnippet ? (
            <Flex style={{ wordWrap: "break-word" }}>
              {t`Edit snippet`}
              {" > "}
              {savedSnippet.name}
            </Flex>
          ) : (
            t`New snippet`
          )
        }
        actions={null}
      />
      {savedSnippet?.archived && (
        <ArchivedEntityBanner
          name={savedSnippet.name}
          entityType={t`snippet`}
          canRestore
          canMove={false}
          canDelete={false}
          onUnarchive={() =>
            updateSnippet({ ...savedSnippet, archived: false })
          }
          onMove={noop}
          onDeletePermanently={noop}
        />
      )}
      <Box p="md" maw={720}>
        <SnippetForm
          snippet={savedSnippet}
          isEditing={!!savedSnippet}
          onSubmit={handleSubmit}
          onArchive={handleArchive}
        />
        {isConfirmationShown && checkData != null && (
          <PLUGIN_DEPENDENCIES.CheckDependenciesModal
            checkData={checkData}
            opened
            onSave={handleSaveAfterConfirmation}
            onClose={handleCloseConfirmation}
          />
        )}
      </Box>
    </>
  );
};
