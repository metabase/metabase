import { useEffect } from "react";

import { useDispatch, useSelector } from "metabase/redux";
import { setUIControls } from "metabase/redux/query-builder";
import type * as Lib from "metabase-lib";

import { getSummaryFormulaToEdit } from "../../../../../store/selectors";

import type { SummaryFormulaInput } from "./types";
import { findSummaryFormula } from "./utils";

/** Opens the Group by formula that a column header asked for, once the formula bar can edit it. */
export function useRequestedFormulaEdit(
  query: Lib.Query,
  stageIndex: number,
  formulaInput: SummaryFormulaInput | undefined,
) {
  const dispatch = useDispatch();
  const expression = useSelector(getSummaryFormulaToEdit);
  const edit = formulaInput?.edit;

  useEffect(() => {
    if (!expression || !edit) {
      return;
    }
    dispatch(setUIControls({ summaryFormulaToEdit: undefined }));
    const formula = findSummaryFormula(
      query,
      stageIndex,
      "columns",
      expression,
    );
    if (formula) {
      edit(formula.clause, null);
    }
  }, [expression, edit, query, stageIndex, dispatch]);
}
