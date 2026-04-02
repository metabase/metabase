import cx from "classnames";
import { push } from "react-router-redux";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { SortableColumnHeader } from "metabase/common/components/ItemsTable/BaseItemsTable";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/lib/redux";
import { Badge, Box, Ellipsified, Flex } from "metabase/ui";
import type { SortingOptions } from "metabase-types/api";

import type { ConversationSortColumn, ConversationSummary } from "../../types";

type Props = {
  conversations: ConversationSummary[];
  isLoading: boolean;
  error: unknown;
  sortingOptions: SortingOptions<ConversationSortColumn>;
  onSortingOptionsChange: (
    options: SortingOptions<ConversationSortColumn>,
  ) => void;
};

function getUserDisplayName(convo: ConversationSummary): string {
  if (convo.user) {
    const { first_name, last_name, email } = convo.user;
    if (first_name || last_name) {
      return [first_name, last_name].filter(Boolean).join(" ");
    }
    return email ?? t`Unknown`;
  }
  return t`Unknown`;
}

export function ConversationsTable({
  conversations,
  isLoading,
  error,
  sortingOptions,
  onSortingOptionsChange,
}: Props) {
  const dispatch = useDispatch();
  const showLoadingAndError = isLoading || error != null;

  const handleRowClick = (convo: ConversationSummary) => {
    dispatch(
      push(`/admin/metabot/usage-stats/conversations/${convo.conversation_id}`),
    );
  };

  return (
    <table className={cx(AdminS.ContentTable, CS.mt2)}>
      <thead>
        <tr>
          <th>{t`User`}</th>
          <th>{t`Profile`}</th>
          <SortableColumnHeader
            name="created_at"
            sortingOptions={sortingOptions}
            onSortingOptionsChange={onSortingOptionsChange}
          >{t`Date`}</SortableColumnHeader>
          <SortableColumnHeader
            name="message_count"
            sortingOptions={sortingOptions}
            onSortingOptionsChange={onSortingOptionsChange}
          >{t`Msgs`}</SortableColumnHeader>
          <SortableColumnHeader
            name="total_tokens"
            sortingOptions={sortingOptions}
            onSortingOptionsChange={onSortingOptionsChange}
          >{t`Tokens`}</SortableColumnHeader>
        </tr>
      </thead>
      <tbody>
        {showLoadingAndError && (
          <tr>
            <td colSpan={5}>
              <LoadingAndErrorWrapper loading={isLoading} error={error} />
            </td>
          </tr>
        )}

        {!showLoadingAndError && (
          <>
            {conversations.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <Flex c="text-tertiary" justify="center">
                    {t`No conversations found`}
                  </Flex>
                </td>
              </tr>
            )}

            {conversations.map((convo) => (
              <tr
                key={convo.conversation_id}
                className={CS.cursorPointer}
                onClick={() => handleRowClick(convo)}
              >
                <td className={CS.textBold}>{getUserDisplayName(convo)}</td>
                <td>
                  {convo.model && (
                    <Badge size="sm" variant="light">
                      {convo.model}
                    </Badge>
                  )}
                </td>
                <td>
                  <Ellipsified style={{ maxWidth: 180 }}>
                    <DateTime value={convo.created_at} unit="day" />
                  </Ellipsified>
                </td>
                <Box component="td" ta="right">
                  {convo.message_count}
                </Box>
                <Box component="td" ta="right">
                  {convo.total_tokens.toLocaleString()}
                </Box>
              </tr>
            ))}
          </>
        )}
      </tbody>
    </table>
  );
}
