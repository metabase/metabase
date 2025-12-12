import type { ReactNode } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useUpdateSnippetMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import type { NativeQuerySnippet } from "metabase-types/api";

import {
  PaneHeader,
  PaneHeaderInput,
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "../../../common/components/PaneHeader";
import { SnippetMoreMenu } from "../SnippetMoreMenu";

const SNIPPET_NAME_MAX_LENGTH = 254;

type SnippetHeaderProps = {
  snippet: NativeQuerySnippet;
  actions?: ReactNode;
};

export function SnippetHeader({ snippet, actions }: SnippetHeaderProps) {
  const dispatch = useDispatch();

  const handleDelete = () => {
    dispatch(push(Urls.dataStudioLibrary()));
  };

  return (
    <PaneHeader
      title={<SnippetNameInput snippet={snippet} />}
      menu={<SnippetMoreMenu snippet={snippet} onDelete={handleDelete} />}
      tabs={<SnippetTabs snippet={snippet} />}
      actions={actions}
      data-testid="snippet-header"
    />
  );
}

type SnippetNameInputProps = {
  snippet: NativeQuerySnippet;
};

function SnippetNameInput({ snippet }: SnippetNameInputProps) {
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
