export type ArchivedActionRowActions = {
  readOnly: boolean;
  onUnarchive: (action: { id: number; name: string }) => void;
};
