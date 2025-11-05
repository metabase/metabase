import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { skipToken, useGetTableQuery } from "metabase/api";
import { CreateLinkModal } from "metabase/collections/components/CreateLinkModal";
import { Button, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";


interface FilterHeaderButtonProps {
  className?: string;
  question: Question;
  isExpanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
}

export function SaveShortcutButton({
  question,
}: FilterHeaderButtonProps) {
  const [showShorctuModal, { open, close }] = useDisclosure();

  const query = question?.query(); // Get the MLv2 query
  const tableId = query && Lib.sourceTableOrCardId(query);
  const hasClauses = Lib.hasClauses(query, -1);

  const isBareTableQuery = Boolean(
    query &&
    typeof tableId === 'number' &&
    !hasClauses
  );

  const { data: table } = useGetTableQuery(isBareTableQuery ? { id: tableId } : skipToken);

  if (!isBareTableQuery) {
    return null;
  }

  return (
    <>
      <Button
        onClick={open}
        data-testid="question-filter-header"
      >
        <Icon name="return" />
      </Button>
      {showShorctuModal && (
        <CreateLinkModal
          onClose={close}
          target= {{
            model: "table",
            id: tableId,
            name: table?.display_name || t`Table ${tableId}`,
          }}
        />
      )}
    </>

  );
}


