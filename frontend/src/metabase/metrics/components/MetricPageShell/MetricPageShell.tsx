import type { ReactNode } from "react";
import { t } from "ttag";

import { useDeleteCardMutation, useUpdateCardMutation } from "metabase/api";
import { ArchivedEntityBanner } from "metabase/archive/components/ArchivedEntityBanner";
import type { CollectionPickerValueItem } from "metabase/common/components/Pickers/CollectionPicker";
import type { PaneHeaderTitleSize } from "metabase/common/data-studio/components/PaneHeader";
import { useHeaderCollection } from "metabase/common/hooks/use-header-collection";
import type { MetricUrls } from "metabase/common/metrics/types";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { useNavigate } from "metabase/router";
import type { Card } from "metabase-types/api";

import { MetricHeader } from "../MetricHeader";

interface MetricPageShellProps {
  card: Card;
  urls: MetricUrls;
  actions?: ReactNode;
  renderBreadcrumbs?: (card: Card) => ReactNode;
  showAppSwitcher?: boolean;
  showDataStudioLink?: boolean;
  titleSize?: PaneHeaderTitleSize;
  isInlineEditable?: boolean;
}

export function MetricPageShell({
  card,
  urls,
  actions,
  renderBreadcrumbs,
  showAppSwitcher,
  showDataStudioLink = true,
  titleSize,
  isInlineEditable = false,
}: MetricPageShellProps) {
  const [updateCard] = useUpdateCardMutation();
  const [deleteCard] = useDeleteCardMutation();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  useHeaderCollection(card.collection_id);

  return (
    <>
      {card.archived && (
        <ArchivedEntityBanner
          name={card.name}
          entityType="metric"
          canMove={card.can_write}
          canRestore={card.can_restore}
          canDelete={card.can_delete}
          onUnarchive={() => updateCard({ id: card.id, archived: false })}
          onMove={(collection: CollectionPickerValueItem) =>
            updateCard({
              id: card.id,
              collection_id: collection.id,
              archived: false,
            })
          }
          onDeletePermanently={async () => {
            try {
              await deleteCard(card.id).unwrap();
              navigate("/trash");
              dispatch(
                addUndo({
                  message: t`This item has been permanently deleted.`,
                }),
              );
            } catch {
              dispatch(
                addUndo({
                  message: t`There was an error permanently deleting this item.`,
                }),
              );
            }
          }}
        />
      )}
      <MetricHeader
        card={card}
        urls={urls}
        actions={actions}
        showAppSwitcher={showAppSwitcher}
        showDataStudioLink={showDataStudioLink}
        breadcrumbs={renderBreadcrumbs?.(card)}
        titleSize={titleSize}
        isInlineEditable={isInlineEditable}
      />
    </>
  );
}
