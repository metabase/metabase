import { msgid, ngettext } from "ttag";

/** The trash confirmation for `count` documents, whose own questions go with them */
export function getTrashDocumentMessage(count: number): string {
  return ngettext(
    msgid`This will trash the document and the questions that are saved in it. Are you sure you want to do this?`,
    `This will trash the documents and the questions that are saved in them. Are you sure you want to do this?`,
    count,
  );
}
