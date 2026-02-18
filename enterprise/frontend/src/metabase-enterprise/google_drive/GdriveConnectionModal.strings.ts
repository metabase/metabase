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

export const getDisconnectModalStrings = ({
  reconnect,
}: {
  reconnect: boolean;
}) => {
  return {
    title: t`To add a new Google Drive folder, the existing one needs to be disconnected first`,
    bodyCopy: reconnect
      ? // eslint-disable-next-line metabase/no-literal-metabase-strings -- admin only string
        t`Only one folder can be synced with Metabase at a time. Your tables and Google Sheets will remain in place.`
      : t`Your existing tables and Google Sheets will remain in place but they will no longer be updated automatically.`,
    connectButtonText: t`Keep connected`,
    disconnectButtonText: t`Disconnect`,
  };
};
