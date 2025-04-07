import { t } from "ttag";

export const getStrings = (objectType: "file" | "folder") => {
  if (objectType === "file") {
    return {
      clickInstruction: t`In Google Drive, right-click on the file and click Share`,
      pasteInstruction: t`Paste the sharing link for the file`,
      copyInstruction: t`In Google Drive, right-click on the file → Share → Copy link`,
      importText: t`Import file`,
    };
  }

  return {
    clickInstruction: t`In Google Drive, right-click on the folder and click Share`,
    pasteInstruction: t`Paste the sharing link for the folder`,
    copyInstruction: t`In Google Drive, right-click on the folder → Share → Copy link`,
    importText: t`Import folder`,
  };
};
