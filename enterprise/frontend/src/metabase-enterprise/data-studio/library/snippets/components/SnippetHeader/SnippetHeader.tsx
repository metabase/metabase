import type { ReactNode } from "react";
import { t } from "ttag";

import { useUpdateSnippetMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { isRootCollection } from "metabase/common/collections/utils";
import { Link } from "metabase/common/components/Link";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import {
  PaneHeader,
  PaneHeaderInput,
  type PaneHeaderProps,
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase/common/data-studio/components/PaneHeader";
import { useCollectionPath } from "metabase/common/data-studio/hooks/use-collection-path/useCollectionPath";
import { useToast } from "metabase/common/hooks";
import { PLUGIN_DEPENDENCIES, PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import type {
  Collection,
  CollectionId,
  NativeQuerySnippet,
} from "metabase-types/api";

import { type SnippetHost, useSnippetHost } from "../../host";
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
  const remoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );
  const host = useSnippetHost();
  // A worktree is an admin's working copy of its branch, exempt from read-only sync.
  const isReadOnly = remoteSyncReadOnly && snippet.worktree_id == null;

  const { path, isLoadingPath } = useCollectionPath({
    collectionId: snippet.collection_id,
  });

  // Drop the root collection; the "SQL snippets" link already represents it.
  const folderPath = path?.filter(
    (collection) => !isRootCollection(collection),
  );

  return (
    <PaneHeader
      showAppSwitcher={!host.hasHostChrome}
      title={
        <SnippetNameInput
          snippet={snippet}
          readOnly={isReadOnly || snippet.archived}
        />
      }
      menu={isReadOnly ? null : <SnippetMoreMenu snippet={snippet} />}
      tabs={<SnippetTabs snippet={snippet} />}
      actions={actions}
      data-testid="snippet-header"
      {...rest}
      breadcrumbs={
        <DataStudioBreadcrumbs loading={isLoadingPath}>
          <Link key="snippet-root-collection" to={host.rootUrl}>
            {t`SQL snippets`}
          </Link>
          {folderPath?.map((collection, index) => (
            <FolderCrumb
              key={collection.id}
              folder={collection}
              ancestorIds={folderPath.slice(0, index + 1).map((c) => c.id)}
              host={host}
            />
          ))}
          <span>{snippet.name}</span>
        </DataStudioBreadcrumbs>
      }
    />
  );
}

type SnippetFolder = Pick<Collection, "id" | "name" | "type" | "archived">;

type FolderCrumbProps = {
  folder: SnippetFolder;
  ancestorIds: CollectionId[];
  host: SnippetHost;
};

function FolderCrumb({ folder, ancestorIds, host }: FolderCrumbProps) {
  const isArchived = folder.type === "trash" || folder.archived;
  const label = folder.type === "trash" ? t`Archived snippets` : folder.name;
  const to = isArchived
    ? host.archivedSnippetsUrl
    : host.getFolderUrl?.(ancestorIds);

  return to != null ? <Link to={to}>{label}</Link> : <span>{label}</span>;
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
  const host = useSnippetHost();
  const tabs: PaneHeaderTab[] = [
    {
      label: t`Definition`,
      to: host.getSnippetUrl(snippet.id),
    },
  ];

  if (PLUGIN_DEPENDENCIES.isEnabled) {
    tabs.push({
      label: t`Dependencies`,
      to: host.getSnippetDependenciesUrl(snippet.id),
    });
  }

  return <PaneHeaderTabs tabs={tabs} />;
}
