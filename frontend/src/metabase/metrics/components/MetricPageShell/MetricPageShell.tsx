import type { ReactNode } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDeleteCardMutation, useUpdateCardMutation } from "metabase/api";
import { ArchivedEntityBanner } from "metabase/archive/components/ArchivedEntityBanner";
import type { CollectionPickerValueItem } from "metabase/common/components/Pickers/CollectionPicker";
import type { MetricUrls } from "metabase/common/metrics/types";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import type { Card } from "metabase-types/api";

import { CollectionBreadcrumbs } from "../CollectionBreadcrumbs";
import { MetricHeader } from "../MetricHeader";

interface MetricPageShellProps {
  card: Card;
  urls: MetricUrls;
  actions?: ReactNode;
  renderBreadcrumbs?: (card: Card) => ReactNode;
  showAppSwitcher?: boolean;
  showDataStudioLink?: boolean;
}

export function MetricPageShell({
  card,
  urls,
  actions,
  renderBreadcrumbs,
  showAppSwitcher,
  showDataStudioLink = true,
}: MetricPageShellProps) {
  const [updateCard] = useUpdateCardMutation();
  const [deleteCard] = useDeleteCardMutation();
  const dispatch = useDispatch();

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
              collection_id: collection.id as number,
              archived: false,
            })
          }
          onDeletePermanently={async () => {
            try {
              await deleteCard(card.id).unwrap();
              dispatch(push("/trash"));
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
        breadcrumbs={
          renderBreadcrumbs ? (
            renderBreadcrumbs(card)
          ) : (
            <CollectionBreadcrumbs card={card} />
          )
        }
      />
    </>
  );
}
