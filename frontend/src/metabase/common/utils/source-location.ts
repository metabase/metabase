import { t } from "ttag";

export const getDatabaseLocationLabel = ({
  databaseName,
  schema,
}: {
  databaseName: string;
  schema?: string | null;
}) => (schema ? `${databaseName} (${schema})` : databaseName);

export const getCollectionLocationLabel = (collectionName?: string | null) =>
  collectionName || t`Our analytics`;

export const getDatabaseLocationParts = ({
  databaseName,
  schema,
}: {
  databaseName: string;
  schema?: string | null;
}) => (schema ? [databaseName, schema] : [databaseName]);

export const getCollectionLocationParts = (collectionName?: string | null) =>
  collectionName ? [t`Library`, collectionName] : [t`Library`];
