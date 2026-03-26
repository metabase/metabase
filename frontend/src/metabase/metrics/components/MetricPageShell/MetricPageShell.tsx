import type { ReactNode } from "react";

import { useDeleteCardMutation, useUpdateCardMutation } from "metabase/api";
import { ArchivedEntityBanner } from "metabase/archive/components/ArchivedEntityBanner";
import type { CollectionPickerValueItem } from "metabase/common/components/Pickers/CollectionPicker";
import type { Card } from "metabase-types/api";

import type { MetricUrls } from "../../types";
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
          onDeletePermanently={() => deleteCard(card.id)}
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
