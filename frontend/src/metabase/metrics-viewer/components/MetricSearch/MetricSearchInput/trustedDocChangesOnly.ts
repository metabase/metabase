import { Annotation, EditorState, Transaction } from "@codemirror/state";

export const programmaticFormulaUpdate = Annotation.define<boolean>();

// The document may only be changed by user input or by our own annotated
// dispatches. In particular this cancels @uiw/react-codemirror's value-sync
// replacement, which would destroy the metric identity RangeSet.
export const trustedDocChangesOnly = EditorState.transactionFilter.of((tr) => {
  // Only document changes are guarded — selection moves, identity/decoration
  // effects and reconfigure pass freely.
  if (!tr.docChanged) {
    return tr;
  }
  const isTrusted =
    tr.annotation(programmaticFormulaUpdate) ||
    tr.annotation(Transaction.userEvent) !== undefined;
  return isTrusted ? tr : [];
});
