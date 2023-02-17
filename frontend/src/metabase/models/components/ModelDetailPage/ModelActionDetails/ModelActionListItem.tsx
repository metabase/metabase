import React, { useCallback } from "react";
import { t } from "ttag";

import EntityMenu from "metabase/components/EntityMenu";
import { useConfirmation } from "metabase/hooks/use-confirmation";

import type { WritebackAction, WritebackQueryAction } from "metabase-types/api";

import { isNotNull } from "metabase/core/utils/types";
import StackedInsightIcon from "./StackedInsightIcon";
import {
  ActionHeader,
  ActionTitle,
  ActionSubtitle,
  ActionSubtitlePart,
  Card,
  CodeBlock,
  EditorLink,
  ImplicitActionCardContentRoot,
  ImplicitActionMessage,
  MenuIcon,
} from "./ModelActionListItem.styled";

interface Props {
  action: WritebackAction;
  editorUrl: string;
  canWrite: boolean;
  onArchive?: () => void;
}

function QueryActionCardContent({ action }: { action: WritebackQueryAction }) {
  return <CodeBlock>{action.dataset_query.native.query}</CodeBlock>;
}

function ImplicitActionCardContent() {
  return (
    <ImplicitActionCardContentRoot>
      <StackedInsightIcon />
      <ImplicitActionMessage>{t`Auto tracking schema`}</ImplicitActionMessage>
    </ImplicitActionCardContentRoot>
  );
}

function ModelActionListItem({
  action,
  editorUrl,
  canWrite,
  onArchive,
}: Props) {
  const isImplicitAction = action.type === "implicit";
  const hasEditorLink = !isImplicitAction;

  const { show: askConfirmation, modalContent: confirmationModal } =
    useConfirmation();

  const handleArchive = useCallback(() => {
    if (!onArchive) {
      return;
    }
    askConfirmation({
      title: t`Archive ${action.name}?`,
      confirmButtonText: t`Archive`,
      onConfirm: onArchive,
    });
  }, [action, askConfirmation, onArchive]);

  const renderCardContent = () =>
    action.type === "query" ? (
      <QueryActionCardContent action={action} />
    ) : action.type === "implicit" ? (
      <ImplicitActionCardContent />
    ) : null;

  const canArchive = onArchive && !isImplicitAction;

  const menuItems = [
    canArchive && {
      title: t`Archive`,
      icon: "archive",
      action: handleArchive,
    },
  ].filter(Boolean);

  const subtitleParts = [
    action.public_uuid && t`Public Action`,
    // Remove this optional chaining after removed all the existing actions without creators
    action.creator?.common_name && t`Created by ${action.creator.common_name}`,
  ].filter(isNotNull);

  const hasMenu = menuItems.length > 0;

  return (
    <>
      <ActionHeader>
        <div>
          <ActionTitle>{action.name}</ActionTitle>
          {subtitleParts.length > 0 && (
            <ActionSubtitle>
              {subtitleParts.map((subtitlePart, index) => (
                <ActionSubtitlePart key={index}>
                  {subtitlePart}
                </ActionSubtitlePart>
              ))}
            </ActionSubtitle>
          )}
        </div>
        {hasMenu && (
          <EntityMenu
            items={menuItems}
            trigger={<MenuIcon name="ellipsis" />}
          />
        )}
      </ActionHeader>
      <Card>
        {renderCardContent()}
        {hasEditorLink && (
          <EditorLink icon={canWrite ? "pencil" : "eye"} to={editorUrl} />
        )}
      </Card>
      {confirmationModal}
    </>
  );
}

export default ModelActionListItem;
