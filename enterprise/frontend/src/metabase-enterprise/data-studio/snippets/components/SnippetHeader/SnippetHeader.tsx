import type { ReactNode } from "react";
import { Link } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useUpdateSnippetMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { DataStudioBreadcrumbs } from "metabase-enterprise/data-studio/common/components/DataStudioBreadcrumbs";
import { useCollectionPath } from "metabase-enterprise/data-studio/common/hooks/use-collection-path/useCollectionPath";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import type { NativeQuerySnippet } from "metabase-types/api";

import {
  PaneHeader,
  PaneHeaderInput,
  type PaneHeaderProps,
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "../../../common/components/PaneHeader";
import { SnippetMoreMenu } from "../SnippetMoreMenu";

const SNIPPET_NAME_MAX_LENGTH = 254;

type SnippetHeaderProps = {
  snippet: NativeQuerySnippet;
  actions?: ReactNode;
};

export function SnippetHeader({
  snippet,
  actions,
  ...rest
}: SnippetHeaderProps & Omit<PaneHeaderProps, "breadcrumbs">) {
  const dispatch = useDispatch();
  const remoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);

  const handleDelete = () => {
    dispatch(push(Urls.dataStudioLibrary()));
  };

  const { path, isLoadingPath } = useCollectionPath({
    collectionId: snippet.collection_id,
  });

  return (
    <PaneHeader
      title={
        <SnippetNameInput snippet={snippet} readOnly={remoteSyncReadOnly} />
      }
      menu={
        remoteSyncReadOnly ? null : (
          <SnippetMoreMenu snippet={snippet} onDelete={handleDelete} />
        )
      }
      tabs={<SnippetTabs snippet={snippet} />}
      actions={actions}
      data-testid="snippet-header"
      {...rest}
      breadcrumbs={
        <DataStudioBreadcrumbs loading={isLoadingPath}>
          <Link key="snippet-root-collection" to={Urls.dataStudioLibrary()}>
            {t`SQL snippets`}
          </Link>
          {path?.map((collection, i) => (
            <Link
              key={collection.id}
              to={Urls.dataStudioLibrary({
                expandedIds: ["root", ...path.slice(0, i + 1).map((c) => c.id)],
              })}
            >
              {collection.name}
            </Link>
          ))}
          <span>{snippet.name}</span>
        </DataStudioBreadcrumbs>
      }
    />
  );
}

type SnippetNameInputProps = {
  readOnly: boolean;
  snippet: NativeQuerySnippet;
};

function SnippetNameInput({ readOnly, snippet }: SnippetNameInputProps) {
  const [updateSnippet] = useUpdateSnippetMutation();
  const [sendToast] = useToast();

  const handleChangeName = async (newName: string) => {
    const { error } = await updateSnippet({
      id: snippet.id,
      name: newName,
    });

    if (error) {
      sendToast({
        message: getErrorMessage(error, t`Failed to update snippet name`),
        icon: "warning",
      });
    } else {
      sendToast({
        message: t`Snippet name updated`,
        icon: "check",
      });
    }
  };

  return (
    <PaneHeaderInput
      initialValue={snippet.name}
      maxLength={SNIPPET_NAME_MAX_LENGTH}
      onChange={handleChangeName}
      readOnly={readOnly}
    />
  );
}

type SnippetTabsProps = {
  snippet: NativeQuerySnippet;
};

function SnippetTabs({ snippet }: SnippetTabsProps) {
  const tabs = getTabs(snippet.id);
  return <PaneHeaderTabs tabs={tabs} />;
}

function getTabs(snippetId: number): PaneHeaderTab[] {
  const tabs: PaneHeaderTab[] = [
    {
      label: t`Definition`,
      to: Urls.dataStudioSnippet(snippetId),
    },
  ];

  if (PLUGIN_DEPENDENCIES.isEnabled) {
    tabs.push({
      label: t`Dependencies`,
      to: Urls.dataStudioSnippetDependencies(snippetId),
    });
  }

  return tabs;
}
