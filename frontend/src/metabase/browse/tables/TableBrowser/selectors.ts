import { createSelector } from "@reduxjs/toolkit";

import { selectQuestionFromOptsBuilder } from "metabase/metadata-store";
import type { State } from "metabase/redux/store";
import * as Urls from "metabase/urls";
import { type Table, isConcreteTableId } from "metabase-types/api";

export const getTableUrl = createSelector(
  [selectQuestionFromOptsBuilder, (_state: State, table: Table) => table],
  (buildDraftQuestion, table): string => {
    // The Saved Questions virtual database exposes cards as "tables" with
    // virtual ids (e.g. card__17). Those have no /table/:slug route, so fall
    // back to the ad-hoc question URL for them.
    if (!isConcreteTableId(table.id)) {
      const question = buildDraftQuestion({
        DEPRECATED_RAW_MBQL_databaseId: table.db_id,
        DEPRECATED_RAW_MBQL_tableId: table.id,
      });
      return Urls.question(question.setDefaultDisplay());
    }
    return Urls.table({ id: table.id, name: table.display_name });
  },
);
